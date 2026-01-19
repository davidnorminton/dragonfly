import { useState, useEffect } from 'react';
import { courseAPI } from '../services/api';

// Simple markdown to HTML converter (same as LessonView)
const formatMarkdown = (text) => {
  if (!text) return '';
  
  // Convert markdown headings
  text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Convert bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Convert italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Convert code blocks
  text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  text = text.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Convert links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Convert lists (simple - bullet points)
  text = text.replace(/^\* (.*$)/gim, '<li>$1</li>');
  text = text.replace(/^- (.*$)/gim, '<li>$1</li>');
  text = text.replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>');
  
  // Wrap consecutive list items in ul
  text = text.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    if (!match.trim().startsWith('<ul>')) {
      return '<ul>' + match + '</ul>';
    }
    return match;
  });
  
  // Convert paragraphs (double newline = paragraph break)
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  text = paragraphs.map(p => {
    p = p.trim();
    // Don't wrap if it's already a block element
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<pre') || p.startsWith('<ol')) {
      return p;
    }
    return '<p>' + p + '</p>';
  }).join('\n');
  
  // Convert line breaks
  text = text.replace(/\n/g, '<br>');
  
  return text;
};

export function CourseContentsPage({ courseId, onNavigate, selectedUser, courseData }) {
  const [course, setCourse] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingLesson, setGeneratingLesson] = useState(null); // section_id that's being generated
  const [selectedSection, setSelectedSection] = useState(null); // Currently selected section
  const [selectedLesson, setSelectedLesson] = useState(null); // Lesson content for selected section
  const [loadingLesson, setLoadingLesson] = useState(false); // Loading state for lesson content
  const [questions, setQuestions] = useState([]);
  const [questionInput, setQuestionInput] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState(null);
  const [showQAPanel, setShowQAPanel] = useState(false);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadQuestions();
    }
  }, [courseId]);

  const loadCourse = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await courseAPI.getCourse(courseId);
      console.log('[CourseContents] Loaded course:', result);
      if (result && result.success && result.course) {
        setCourse(result.course);
        setSections(result.course.sections || []);
        return result.course;
      } else {
        throw new Error(result?.error || 'Failed to load course');
      }
    } catch (err) {
      console.error('Error loading course:', err);
      if (courseData && courseData.id === courseId) {
        setCourse(courseData);
        setSections(courseData.sections || []);
        return courseData;
      }
      setError(err.message || 'Failed to load course');
    } finally {
      setLoading(false);
    }
    return null;
  };

  const loadQuestions = async () => {
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const result = await courseAPI.getCourseQuestions(courseId);
      if (result && result.success && Array.isArray(result.questions)) {
        setQuestions(result.questions);
      } else {
        setQuestions([]);
      }
    } catch (err) {
      console.error('Error loading course questions:', err);
      setQuestionsError(err.message || 'Failed to load questions');
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleGenerateLesson = async (sectionId, regenerate = false) => {
    if (generatingLesson) {
      return; // Prevent multiple generations
    }

    setGeneratingLesson(sectionId);
    try {
      const result = await courseAPI.generateLesson(sectionId, regenerate);
      console.log('[CourseContents] Generated lesson:', result);
      if (result && result.success) {
        // Reload course to get updated section status
        const updatedCourse = await loadCourse();
        const updatedSection = updatedCourse?.sections?.find(s => s.id === sectionId) || null;

        if (selectedSection && selectedSection.id === sectionId) {
          if (updatedSection) {
            setSelectedSection(updatedSection);
          }
          if (result.lesson_id && result.content) {
            setSelectedLesson({
              id: result.lesson_id,
              content: result.content,
              section: {
                id: updatedSection?.id || sectionId,
                title: updatedSection?.title || selectedSection.title,
                order_index: updatedSection?.order_index ?? selectedSection.order_index
              },
              course: {
                id: updatedCourse?.id || course?.id,
                title: updatedCourse?.title || course?.title
              }
            });
          } else if (updatedSection?.lesson_id) {
            await loadLessonContent(updatedSection.lesson_id);
          }
        }
      } else {
        alert(`Failed to generate lesson: ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error generating lesson:', err);
      alert(`Error generating lesson: ${err.message || 'Unknown error'}`);
    } finally {
      setGeneratingLesson(null);
    }
  };

  const loadLessonContent = async (lessonId) => {
    setLoadingLesson(true);
    try {
      const result = await courseAPI.getLesson(lessonId);
      if (result && result.success && result.lesson) {
        setSelectedLesson(result.lesson);
      } else {
        setSelectedLesson(null);
      }
    } catch (err) {
      console.error('Error loading lesson:', err);
      setSelectedLesson(null);
    } finally {
      setLoadingLesson(false);
    }
  };

  const handleSectionClick = async (section) => {
    setSelectedSection(section);
    if (section.has_lesson && section.lesson_id) {
      await loadLessonContent(section.lesson_id);
    } else {
      setSelectedLesson(null);
    }
  };

  const handleAskQuestion = async () => {
    if (!questionInput.trim() || askingQuestion) {
      return;
    }

    setAskingQuestion(true);
    setQuestionsError(null);
    try {
      const result = await courseAPI.askCourseQuestion(
        courseId,
        questionInput.trim(),
        selectedSection?.id,
        selectedUser?.id
      );
      if (result && result.success && result.qa) {
        setQuestions(prev => [...prev, result.qa]);
        setQuestionInput('');
      } else {
        setQuestionsError(result?.error || 'Failed to get an answer');
      }
    } catch (err) {
      console.error('Error asking course question:', err);
      setQuestionsError(err.message || 'Failed to get an answer');
    } finally {
      setAskingQuestion(false);
    }
  };

  if (loading) {
    return (
      <div className="course-contents-page">
        <div className="course-contents-container">
          <div className="loading-state">
            <p>Loading course...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="course-contents-page">
        <div className="course-contents-container">
          <div className="error-state">
            <p>{error || 'Course not found'}</p>
            <button onClick={() => onNavigate('stories')}>Back to Stories</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="course-contents-page">
      <div className="course-contents-container">
        <div className="course-contents-header">
          <button 
            className="back-button"
            onClick={() => onNavigate('courses')}
          >
            ← Back
          </button>
          <h1>{course.title}</h1>
        </div>

        <div className="course-contents-layout">
          {/* Left Panel: Sections List */}
          <div className="course-contents-left">
            <h2>Course Sections</h2>
            <div className="sections-list">
              {sections.map((section, index) => (
                <div 
                  key={section.id} 
                  className={`section-item ${section.has_lesson ? 'has-lesson' : ''} ${selectedSection?.id === section.id ? 'selected' : ''}`}
                  onClick={() => handleSectionClick(section)}
                >
                  <div className="section-number">{index + 1}</div>
                  <div className="section-content">
                    <h3>{section.title}</h3>
                    {section.summary && (
                      <p className="section-summary">{section.summary}</p>
                    )}
                    {section.subsections && section.subsections.length > 0 && (
                      <div className="subsections-list">
                        {section.subsections.map((subsection, subIndex) => (
                          <div key={subsection.id || subIndex} className="subsection-item">
                            <div className="subsection-title">
                              {subIndex + 1}. {subsection.title}
                            </div>
                            {subsection.summary && (
                              <div className="subsection-summary">{subsection.summary}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="section-actions">
                      {!section.has_lesson ? (
                        <button
                          className="generate-lesson-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateLesson(section.id);
                          }}
                          disabled={generatingLesson === section.id}
                        >
                          {generatingLesson === section.id ? 'Generating...' : 'Generate Lesson'}
                        </button>
                      ) : (
                        <>
                          <span className="lesson-status">✓ Lesson ready</span>
                          <button
                            className="regenerate-lesson-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Regenerate this lesson? The existing lesson will be replaced.')) {
                                handleGenerateLesson(section.id, true);
                              }
                            }}
                            disabled={generatingLesson === section.id}
                          >
                            {generatingLesson === section.id ? 'Regenerating...' : 'Regenerate'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Lesson Content */}
          <div className="course-contents-right">
            <div className="course-content-scroll">
              {loadingLesson ? (
                <div className="loading-state">
                  <p>Loading lesson...</p>
                </div>
              ) : selectedLesson ? (
                <div className="lesson-content-panel">
                  <div 
                    className="lesson-content" 
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(selectedLesson.content) }} 
                  />
                </div>
              ) : selectedSection && !selectedSection.has_lesson ? (
                <div className="lesson-content-panel empty">
                  <div className="empty-lesson-state">
                    <h2>{selectedSection.title}</h2>
                    <p>No lesson generated yet. Click "Generate Lesson" in the left panel to create content for this section.</p>
                  </div>
                </div>
              ) : (
                <div className="lesson-content-panel empty">
                  <div className="empty-lesson-state">
                    <p>Select a section from the left panel to view its lesson content.</p>
                  </div>
                </div>
              )}
            </div>

            {showQAPanel && (
            <div className="course-qa-panel">
              <div className="course-qa-header">
                <h3>Ask a follow-up question</h3>
                <button 
                  className="course-qa-close"
                  onClick={() => setShowQAPanel(false)}
                  title="Close"
                >
                  ×
                </button>
                <span className="course-qa-context">
                  {selectedSection ? `About: ${selectedSection.title}` : 'About this course'}
                </span>
              </div>

              <div className="course-qa-input">
                <textarea
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="Ask a question about this course or the selected section..."
                  rows={3}
                  disabled={askingQuestion}
                />
                <button
                  className="course-qa-submit"
                  onClick={handleAskQuestion}
                  disabled={askingQuestion || !questionInput.trim()}
                >
                  {askingQuestion ? 'Asking...' : 'Ask'}
                </button>
              </div>

              {questionsError && (
                <div className="course-qa-error">Error: {questionsError}</div>
              )}

              <div className="course-qa-list">
                {questionsLoading ? (
                  <div className="course-qa-loading">Loading questions...</div>
                ) : questions.length === 0 ? (
                  <div className="course-qa-empty">No questions yet. Ask the first one.</div>
                ) : (
                  questions.map((qa) => (
                    <div key={qa.id} className="course-qa-item">
                      <div className="course-qa-question">{qa.question}</div>
                      <div
                        className="course-qa-answer"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(qa.answer) }}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
            )}

            {!showQAPanel && (
              <button
                className="course-qa-toggle-btn"
                onClick={() => setShowQAPanel(true)}
                title="Ask a question"
              >
                💬
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
