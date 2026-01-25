import { useState, useEffect } from 'react';
import './Personal.css';

const PERSONAL_SESSION_ID = 'personal-chat';

export function PersonalSummariesPage({ onNavigate }) {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);

  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/personal/summaries?session_id=${PERSONAL_SESSION_ID}`);
      const result = await response.json();
      if (result.success) {
        setSummaries(result.summaries || []);
      }
    } catch (err) {
      console.error('Error loading summaries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSummary = (summary) => {
    setSelectedSummary(summary);
    setEditedSummaryText(summary.summary);
    setEditingSummary(false);
  };

  const handleCloseSummary = () => {
    setSelectedSummary(null);
    setEditingSummary(false);
    setEditedSummaryText('');
  };

  const handleEditSummary = () => {
    setEditingSummary(true);
    setEditedSummaryText(selectedSummary?.summary || '');
  };

  const handleCancelEdit = () => {
    setEditingSummary(false);
    setEditedSummaryText(selectedSummary?.summary || '');
  };

  const handleSaveSummary = async () => {
    if (!selectedSummary) return;
    
    setSavingSummary(true);
    try {
      const response = await fetch(`/api/personal/summaries/${selectedSummary.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: editedSummaryText
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setSelectedSummary({ ...selectedSummary, summary: editedSummaryText });
        setEditingSummary(false);
        await loadSummaries();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Error saving summary:', err);
      alert(`Error saving summary: ${err.message}`);
    } finally {
      setSavingSummary(false);
    }
  };

  const handleDeleteSummary = async (summaryId) => {
    if (!confirm('Are you sure you want to delete this summary?')) return;
    
    try {
      const response = await fetch(`/api/personal/summaries/${summaryId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      if (result.success) {
        await loadSummaries();
        if (selectedSummary && selectedSummary.id === summaryId) {
          setSelectedSummary(null);
        }
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Error deleting summary:', err);
      alert(`Error deleting summary: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="personal-page">
        <div className="loading">Loading summaries...</div>
      </div>
    );
  }

  return (
    <div className="personal-page">
      <div className="personal-main-container">
        <div className="personal-left-pane">
          <div className="personal-header">
            <h1>All Summaries</h1>
            {onNavigate && (
              <button
                className="btn-back"
                onClick={() => onNavigate('personal')}
              >
                ← Back to Summaries
              </button>
            )}
          </div>

          <div className="summaries-list-view">
            {summaries.length === 0 ? (
              <div className="empty-state">
                <p>No summaries created yet.</p>
              </div>
            ) : (
              summaries.map((summary) => (
                <div
                  key={summary.id}
                  className={`summary-list-item ${selectedSummary?.id === summary.id ? 'selected' : ''}`}
                  onClick={() => handleViewSummary(summary)}
                >
                  <div className="summary-list-header">
                    <h3>{summary.title || `Summary ${summary.id}`}</h3>
                    <button
                      className="btn-delete-summary-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSummary(summary.id);
                      }}
                      title="Delete summary"
                    >
                      ×
                    </button>
                  </div>
                  <div className="summary-list-meta">
                    <span>{summary.message_count || 0} messages</span>
                    {summary.start_date && summary.end_date && (
                      <span>
                        {new Date(summary.start_date).toLocaleDateString()} - {new Date(summary.end_date).toLocaleDateString()}
                      </span>
                    )}
                    <span>Created: {new Date(summary.created_at).toLocaleString()}</span>
                  </div>
                  <div className="summary-list-preview">
                    {summary.summary.substring(0, 200)}
                    {summary.summary.length > 200 ? '...' : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {selectedSummary && (
          <div className="personal-right-pane">
            <div className="summary-header">
              <h2>{selectedSummary.title || 'Summary'}</h2>
              <div className="summary-header-actions">
                {!editingSummary ? (
                  <button
                    className="btn-edit-summary"
                    onClick={handleEditSummary}
                    title="Edit summary"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      className="btn-save-summary"
                      onClick={handleSaveSummary}
                      disabled={savingSummary}
                      title="Save changes"
                    >
                      {savingSummary ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="btn-cancel-edit"
                      onClick={handleCancelEdit}
                      disabled={savingSummary}
                      title="Cancel editing"
                    >
                      Cancel
                    </button>
                  </>
                )}
                <button
                  className="btn-close"
                  onClick={handleCloseSummary}
                  title="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="summary-meta">
              <span>{selectedSummary.message_count || 0} messages</span>
              {selectedSummary.start_date && selectedSummary.end_date && (
                <span>
                  {new Date(selectedSummary.start_date).toLocaleDateString()} - {new Date(selectedSummary.end_date).toLocaleDateString()}
                </span>
              )}
              <span>Created: {new Date(selectedSummary.created_at).toLocaleString()}</span>
            </div>
            <div className="summary-content">
              {editingSummary ? (
                <textarea
                  className="summary-edit-textarea"
                  value={editedSummaryText}
                  onChange={(e) => setEditedSummaryText(e.target.value)}
                  rows={20}
                />
              ) : (
                <p>{selectedSummary.summary}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
