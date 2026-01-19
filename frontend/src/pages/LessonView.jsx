import { useState, useEffect } from 'react';
import { courseAPI } from '../services/api';

// Simple markdown to HTML converter
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

export function LessonViewPage({ lessonId, sectionId, courseId, onNavigate }) {
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (lessonId) {
      loadLesson(lessonId);
    } else if (sectionId && courseId) {
      // If we have sectionId but not lessonId, load from section
      loadLessonFromSection();
    } else if (sectionId || courseId) {
      setError('Both section ID and course ID are required when lesson ID is not provided');
      setLoading(false);
    }
  }, [lessonId, sectionId, courseId]);


  const loadLesson = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const result = await courseAPI.getLesson(id);
      console.log('[LessonView] Loaded lesson:', result);
      if (result && result.success && result.lesson) {
        setLesson(result.lesson);
      } else {
        setError(result?.error || 'Failed to load lesson');
      }
    } catch (err) {
      console.error('Error loading lesson:', err);
      setError(err.message || 'Failed to load lesson');
    } finally {
      setLoading(false);
    }
  };

  const loadLessonFromSection = async () => {
    // Load course to find the lesson for this section
    setLoading(true);
    setError(null);
    try {
      if (!courseId) {
        setError('Course ID is required');
        setLoading(false);
        return;
      }
      const result = await courseAPI.getCourse(courseId);
      if (result && result.success && result.course) {
        const section = result.course.sections?.find(s => s.id === sectionId);
        if (section && section.has_lesson && section.lesson_id) {
          // Load the lesson using the lesson ID
          await loadLesson(section.lesson_id);
        } else {
          setError('Lesson not found for this section');
          setLoading(false);
        }
      } else {
        setError(result?.error || 'Failed to load course');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error loading lesson from section:', err);
      setError(err.message || 'Failed to load lesson');
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (lesson?.course?.id) {
      onNavigate('course-contents', { courseId: lesson.course.id });
    } else if (courseId) {
      onNavigate('course-contents', { courseId: courseId });
    } else {
      onNavigate('stories');
    }
  };

  if (loading) {
    return (
      <div className="lesson-view-page">
        <div className="lesson-view-container">
          <div className="loading-state">
            <p>Loading lesson...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="lesson-view-page">
        <div className="lesson-view-container">
          <div className="error-state">
            <p>{error || 'Lesson not found'}</p>
            <button onClick={handleBack}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-view-page">
      <div className="lesson-view-container">
        <div className="lesson-header">
          <button className="back-button" onClick={handleBack}>
            ← Back
          </button>
          <div className="breadcrumb">
            {lesson.course && (
              <>
                <span 
                  className="breadcrumb-link"
                  onClick={() => onNavigate('course-contents', { courseId: lesson.course.id })}
                >
                  {lesson.course.title}
                </span>
                <span className="breadcrumb-separator">→</span>
              </>
            )}
            <span className="breadcrumb-current">{lesson.section.title}</span>
          </div>
          <h1>{lesson.section.title}</h1>
        </div>

        <div className="lesson-content" dangerouslySetInnerHTML={{ __html: formatMarkdown(lesson.content) }} />
      </div>
    </div>
  );
}
