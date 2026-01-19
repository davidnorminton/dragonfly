import { useState, useEffect } from 'react';
import { courseAPI } from '../services/api';

export function CoursesPage({ onNavigate, selectedUser }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCourse, setGeneratedCourse] = useState(null);
  const [generatingLesson, setGeneratingLesson] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOption, setFilterOption] = useState('all');
  const [sortOption, setSortOption] = useState('recent');

  useEffect(() => {
    loadCourses();
  }, [selectedUser?.id]);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await courseAPI.getCourses(selectedUser?.id);
      console.log('[Courses] Loaded courses:', result);
      if (result && result.success !== false && result.courses) {
        setCourses(result.courses);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error('Error loading courses:', err);
      setError(err.message || 'Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCourse = async () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt describing what you want to learn');
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedCourse(null);
    try {
      const result = await courseAPI.generateOutline(prompt.trim(), selectedUser?.id);
      console.log('[Courses] Generated course:', result);
      if (result && result.success && result.course_id) {
        // Store the generated course to display in right panel with section details
        let sections = result.sections || [];
        try {
          const courseResult = await courseAPI.getCourse(result.course_id);
          if (courseResult && courseResult.success && courseResult.course) {
            sections = courseResult.course.sections || sections;
          }
        } catch (err) {
          console.warn('[Courses] Using generate-outline response for preview:', err?.message || err);
        }
        setGeneratedCourse({
          id: result.course_id,
          title: result.course_title,
          sections
        });
        // Reload courses list to include the new course
        await loadCourses();
      } else {
        setError(result?.error || 'Failed to generate course outline');
      }
    } catch (err) {
      console.error('Error generating course:', err);
      console.error('Error response:', err.response);
      console.error('Error data:', err.response?.data);
      // Extract error message from various possible formats
      let errorMessage = 'Failed to generate course outline';
      if (err.response?.data?.detail) {
        errorMessage = String(err.response.data.detail);
      } else if (err.response?.data?.error) {
        errorMessage = String(err.response.data.error);
      } else if (err.response?.data?.message) {
        errorMessage = String(err.response.data.message);
      } else if (err.message) {
        errorMessage = String(err.message);
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else {
        errorMessage = `Error: ${JSON.stringify(err)}`;
      }
      // Ensure error message is not empty or too short
      if (!errorMessage || errorMessage.length < 3) {
        errorMessage = 'Failed to generate course outline. Please check the console for details.';
      }
      setError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const handleViewCourse = () => {
    if (generatedCourse?.id) {
      onNavigate('course-contents', { courseId: generatedCourse.id, courseData: generatedCourse });
    }
  };

  const handlePinToggle = async (courseId, nextPinned) => {
    setCourses(prev =>
      prev.map(course =>
        course.id === courseId ? { ...course, pinned: nextPinned } : course
      )
    );
    try {
      const result = await courseAPI.setCoursePinned(courseId, nextPinned);
      if (!result || result.success !== true) {
        throw new Error(result?.error || 'Failed to update pin');
      }
    } catch (err) {
      console.error('Error updating course pin:', err);
      // Revert on failure
      setCourses(prev =>
        prev.map(course =>
          course.id === courseId ? { ...course, pinned: !nextPinned } : course
        )
      );
    }
  };

  const handleDeleteCourse = async (courseId, courseTitle) => {
    if (!confirm(`Are you sure you want to delete "${courseTitle}"? This will permanently remove the course and all its sections, lessons, and Q&A. This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await courseAPI.deleteCourse(courseId);
      if (result && result.success) {
        // Remove from local state
        setCourses(prev => prev.filter(course => course.id !== courseId));
      } else {
        alert(`Failed to delete course: ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error deleting course:', err);
      alert(`Error deleting course: ${err.message || 'Unknown error'}`);
    }
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title?.toLowerCase().includes(searchTerm.toLowerCase().trim());
    if (!matchesSearch) return false;
    if (filterOption === 'has_lessons') {
      return course.lesson_count > 0;
    }
    if (filterOption === 'with_qa') {
      return (course.question_count || 0) > 0;
    }
    return true;
  });

  const sortedCourses = [...filteredCourses].sort((a, b) => {
    // Pinned first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (sortOption === 'alphabetical') {
      return (a.title || '').localeCompare(b.title || '');
    }
    if (sortOption === 'lessons') {
      return (b.lesson_count || 0) - (a.lesson_count || 0);
    }
    if (sortOption === 'qa') {
      return (b.question_count || 0) - (a.question_count || 0);
    }
    // Default: recent
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const handleGenerateLessonFromPreview = async (sectionId, sectionTitle) => {
    if (generatingLesson) {
      return; // Prevent multiple generations
    }

    setGeneratingLesson(sectionId);
    try {
      const result = await courseAPI.generateLesson(sectionId);
      console.log('[Courses] Generated lesson from preview:', result);
      if (result && result.success) {
        // Reload courses list to update lesson counts
        await loadCourses();
        // Refresh the generated course preview - we need to reload the course data
        if (generatedCourse?.id) {
          const courseResult = await courseAPI.getCourse(generatedCourse.id);
          if (courseResult && courseResult.success && courseResult.course) {
            const updatedSections = courseResult.course.sections.map(s => ({
              ...s,
              has_lesson: s.has_lesson,
              lesson_id: s.lesson_id
            }));
            setGeneratedCourse(prev => ({
              ...prev,
              sections: updatedSections
            }));
          }
        }
      } else {
        alert(`Failed to generate lesson for "${sectionTitle}": ${result?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error generating lesson from preview:', err);
      alert(`Error generating lesson for "${sectionTitle}": ${err.message || 'Unknown error'}`);
    } finally {
      setGeneratingLesson(null);
    }
  };

  if (loading) {
    return (
      <div className="courses-page">
        <div className="courses-container-simple">
          <div className="courses-loading">Loading courses...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="courses-page">
        <div className="courses-container-simple">
          <div className="courses-error">Error: {error}</div>
        </div>
      </div>
    );
  }

  // Show split view if we have courses OR if user explicitly wants to create OR has generated a course
  const showSplitView = courses.length > 0 || showCreateForm || generatedCourse;

  if (!showSplitView) {
    // Simple view: just show empty state with "Add Course" button
    return (
      <div className="courses-page">
        <div className="courses-container-simple">
          <div className="courses-empty-simple">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
            </svg>
            <h2>No courses yet</h2>
            <p>Create your first AI-generated course to get started.</p>
            <button
              className="add-course-btn-large"
              onClick={() => setShowCreateForm(true)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Add Course
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="courses-page">
      <div className="courses-layout">
        {/* Left Panel - Courses List or Input */}
        <div className="courses-left-panel">
          {!showCreateForm && !generatedCourse && !generating ? (
            <>
              <div className="courses-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <h2>My Courses</h2>
                  <button
                    className="add-course-btn-small"
                    onClick={() => setShowCreateForm(true)}
                    title="Create new course"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                  </button>
                </div>
              </div>

              <div className="courses-list-section">
                {courses.length === 0 ? (
                  <div className="courses-empty-in-panel">
                    <p>No courses yet.</p>
                    <button
                      className="action-btn primary"
                      onClick={() => setShowCreateForm(true)}
                    >
                      Create Your First Course
                    </button>
                  </div>
                ) : (
                  <div className="courses-list">
                    <div className="courses-list-controls">
                      <input
                        className="courses-search-input"
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search courses..."
                      />
                      <select
                        className="courses-filter-select"
                        value={filterOption}
                        onChange={(e) => setFilterOption(e.target.value)}
                      >
                        <option value="all">All courses</option>
                        <option value="has_lessons">Has lessons</option>
                        <option value="with_qa">With Q&A</option>
                      </select>
                      <select
                        className="courses-sort-select"
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value)}
                      >
                        <option value="recent">Most recent</option>
                        <option value="alphabetical">A–Z</option>
                        <option value="lessons">Most lessons</option>
                        <option value="qa">Most Q&A</option>
                      </select>
                    </div>
                    {sortedCourses.length === 0 ? (
                      <div className="courses-empty-in-panel">
                        <p>No courses match your filters.</p>
                      </div>
                    ) : sortedCourses.map((course) => (
                      <div
                        key={course.id}
                        className="course-item"
                        onClick={() => onNavigate('course-contents', { courseId: course.id })}
                      >
                        <div className="course-item-content">
                          <h3 className="course-item-title">{course.title}</h3>
                          <div className="course-item-meta">
                            <span className="course-item-sections">
                              {course.section_count} section{course.section_count !== 1 ? 's' : ''}
                            </span>
                            {course.lesson_count > 0 && (
                              <span className="course-item-lessons">
                                {course.lesson_count} lesson{course.lesson_count !== 1 ? 's' : ''} ready
                              </span>
                            )}
                            <span className="course-item-qa">
                              {course.question_count || 0} Q&A
                            </span>
                            <span className="course-item-date">
                              {course.created_at 
                                ? new Date(course.created_at).toLocaleDateString()
                                : 'Unknown date'}
                            </span>
                          </div>
                          <div className="course-item-progress">
                            <div className="course-progress-bar">
                              <div
                                className="course-progress-fill"
                                style={{
                                  width: course.section_count
                                    ? `${Math.round((course.lesson_count / course.section_count) * 100)}%`
                                    : '0%'
                                }}
                              />
                            </div>
                            <span className="course-progress-text">
                              {course.lesson_count}/{course.section_count} lessons
                            </span>
                          </div>
                        </div>
                        <div className="course-item-actions">
                          {course.lesson_count > 0 && (
                            <button
                              className="course-continue-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigate('course-contents', { courseId: course.id });
                              }}
                            >
                              Continue
                            </button>
                          )}
                          <button
                            className={`course-pin-btn ${course.pinned ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePinToggle(course.id, !course.pinned);
                            }}
                            title={course.pinned ? 'Unpin course' : 'Pin course'}
                          >
                            ★
                          </button>
                          <button
                            className="course-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCourse(course.id, course.title);
                            }}
                            title="Delete course"
                          >
                            🗑
                          </button>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="courses-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <h2>Create Course</h2>
                  {courses.length > 0 && (
                    <button
                      className="close-form-btn"
                      onClick={() => {
                        setShowCreateForm(false);
                        setPrompt('');
                        setError(null);
                        setGeneratedCourse(null);
                      }}
                      title="Back to courses"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  )}
                </div>
                <p>Enter what you want to learn, and AI will create a structured course outline.</p>
              </div>
              
              <div className="courses-input-section">
                <div className="form-group">
                  <label htmlFor="course-prompt">What would you like to learn?</label>
                  <textarea
                    id="course-prompt"
                    className="course-prompt-input"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g., Learn Python programming from scratch, Master React.js, Understand machine learning basics..."
                    rows={8}
                    disabled={generating}
                  />
                </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                <div className="error-text">
                  <strong>Error:</strong> {error}
                </div>
              </div>
            )}

                <button
                  className="generate-course-btn"
                  onClick={handleGenerateCourse}
                  disabled={generating || !prompt.trim()}
                >
                  {generating ? (
                    <>
                      <span className="spinner"></span>
                      Generating Course...
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                      </svg>
                      Generate Course
                    </>
                  )}
                </button>

                {generating && (
                  <div className="generating-note">
                    <p>AI is analyzing your request and creating a structured course outline...</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Panel - Generated Content or Empty */}
        <div className="courses-right-panel">
          <div className="courses-panel-header">
            <h2>{generatedCourse ? 'Generated Course' : 'Preview'}</h2>
          </div>

          <div className="courses-output-section">
            {!generatedCourse && !generating ? (
              <div className="courses-empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
                </svg>
                <p>Your generated course outline will appear here.</p>
                <p className="empty-hint">Enter a learning topic on the left and click "Generate Course" to begin.</p>
              </div>
            ) : generating ? (
              <div className="courses-loading-state">
                <div className="loading-spinner-large"></div>
                <p>AI is creating your course outline...</p>
                <p className="loading-hint">This may take a moment. Please wait.</p>
              </div>
            ) : generatedCourse ? (
              <div className="courses-generated-content">
                <div className="course-preview-header">
                  <h3>{generatedCourse.title}</h3>
                  <button
                    className="view-course-btn"
                    onClick={handleViewCourse}
                  >
                    View Course
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                    </svg>
                  </button>
                </div>

                <div className="course-sections-preview">
                  <h4>Course Breakdown - {generatedCourse.sections.length} Sections</h4>
                  <div className="sections-list-preview">
                    {generatedCourse.sections.map((section, index) => (
                      <div key={section.id || index} className="section-preview-item">
                        <div className="section-number-preview">{index + 1}</div>
                        <div className="section-content-preview">
                          <div className="section-title-preview">{section.title}</div>
                          {section.subsections && section.subsections.length > 0 && (
                            <div className="section-subsections-preview">
                              {section.subsections.map((subsection, subIndex) => (
                                <div key={subsection.id || subIndex} className="subsection-preview-item">
                                  <div className="subsection-preview-title">
                                    {subIndex + 1}. {subsection.title}
                                  </div>
                                  {subsection.summary && (
                                    <div className="subsection-preview-summary">{subsection.summary}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {section.has_lesson ? (
                            <div className="section-lesson-status">
                              <span className="lesson-ready-badge">✓ Lesson Ready</span>
                              {section.lesson_id && (
                                <button
                                  className="view-lesson-btn-small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigate('lesson-view', { 
                                      lessonId: section.lesson_id, 
                                      sectionId: section.id, 
                                      courseId: generatedCourse.id 
                                    });
                                  }}
                                  title="View lesson"
                                >
                                  View
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              className="generate-lesson-btn-small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateLessonFromPreview(section.id, section.title);
                              }}
                              disabled={generatingLesson === section.id || generatingLesson !== null}
                              title="Generate lesson for this section"
                            >
                              {generatingLesson === section.id ? (
                                <>
                                  <span className="spinner-small"></span>
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                  </svg>
                                  Generate Lesson
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="course-actions">
                  <button
                    className="action-btn primary"
                    onClick={handleViewCourse}
                  >
                    Open Course
                  </button>
                  <button
                    className="action-btn secondary"
                    onClick={() => {
                      setGeneratedCourse(null);
                      setPrompt('');
                      setShowCreateForm(false);
                    }}
                  >
                    Create New
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
