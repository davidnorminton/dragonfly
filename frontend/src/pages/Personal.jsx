import { useState, useEffect } from 'react';
import './Personal.css';

const PERSONAL_SESSION_ID = 'personal-chat';

export function PersonalPage() {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [messages, setMessages] = useState([]);
  const [selectedDateRange, setSelectedDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    loadSummaries();
    loadMessages();
  }, []);

  const loadSummaries = async () => {
    try {
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

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/personal/chat/history?session_id=${PERSONAL_SESSION_ID}&limit=1000`);
      const result = await response.json();
      if (result.success) {
        setMessages(result.messages || []);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const handleCreateSummary = async () => {
    if (creating) return;
    
    setCreating(true);
    try {
      const response = await fetch('/api/personal/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: PERSONAL_SESSION_ID,
          title: `Summary ${new Date().toLocaleDateString()}`,
          start_date: selectedDateRange.start || null,
          end_date: selectedDateRange.end || null
        })
      });
      
      const result = await response.json();
      if (result.success) {
        await loadSummaries();
        setSelectedDateRange({ start: '', end: '' });
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Error creating summary:', err);
      alert(`Error creating summary: ${err.message}`);
    } finally {
      setCreating(false);
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
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Error deleting summary:', err);
      alert(`Error deleting summary: ${err.message}`);
    }
  };

  const getDateRangeFromMessages = () => {
    if (messages.length === 0) return { start: '', end: '' };
    
    const dates = messages
      .map(m => m.created_at ? new Date(m.created_at) : null)
      .filter(d => d !== null)
      .sort((a, b) => a - b);
    
    if (dates.length === 0) return { start: '', end: '' };
    
    return {
      start: dates[0].toISOString().split('T')[0],
      end: dates[dates.length - 1].toISOString().split('T')[0]
    };
  };

  const totalMessages = messages.length;
  const totalSummaries = summaries.length;
  const summarizedMessages = summaries.reduce((sum, s) => sum + (s.message_count || 0), 0);

  return (
    <div className="personal-page">
      <div className="personal-header">
        <h1>Personal Chat Management</h1>
        <p className="personal-subtitle">Manage conversation summaries to reduce context size</p>
      </div>

      <div className="personal-stats">
        <div className="stat-card">
          <div className="stat-value">{totalMessages}</div>
          <div className="stat-label">Total Messages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalSummaries}</div>
          <div className="stat-label">Summaries</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{summarizedMessages}</div>
          <div className="stat-label">Summarized Messages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalMessages - summarizedMessages}</div>
          <div className="stat-label">Active Messages</div>
        </div>
      </div>

      <div className="personal-actions">
        <div className="create-summary-section">
          <h2>Create Summary</h2>
          <div className="date-range-selector">
            <div className="date-input-group">
              <label>Start Date (optional):</label>
              <input
                type="date"
                value={selectedDateRange.start}
                onChange={(e) => setSelectedDateRange({ ...selectedDateRange, start: e.target.value })}
              />
            </div>
            <div className="date-input-group">
              <label>End Date (optional):</label>
              <input
                type="date"
                value={selectedDateRange.end}
                onChange={(e) => setSelectedDateRange({ ...selectedDateRange, end: e.target.value })}
              />
            </div>
            <button
              className="btn-quick-range"
              onClick={() => {
                const range = getDateRangeFromMessages();
                setSelectedDateRange(range);
              }}
            >
              Use Full Range
            </button>
          </div>
          <button
            className="btn-create-summary"
            onClick={handleCreateSummary}
            disabled={creating}
          >
            {creating ? 'Creating Summary...' : 'Create Summary from Messages'}
          </button>
          <p className="help-text">
            Summaries help reduce context size by condensing old conversations. 
            Leave dates empty to summarize all messages, or specify a range.
          </p>
        </div>
      </div>

      <div className="summaries-section">
        <h2>Conversation Summaries</h2>
        {loading ? (
          <div className="loading">Loading summaries...</div>
        ) : summaries.length === 0 ? (
          <div className="empty-state">
            <p>No summaries yet. Create one to start managing your conversation context.</p>
          </div>
        ) : (
          <div className="summaries-list">
            {summaries.map((summary) => (
              <div key={summary.id} className="summary-card">
                <div className="summary-header">
                  <h3>{summary.title || `Summary ${summary.id}`}</h3>
                  <button
                    className="btn-delete-summary"
                    onClick={() => handleDeleteSummary(summary.id)}
                  >
                    Delete
                  </button>
                </div>
                <div className="summary-meta">
                  <span>{summary.message_count || 0} messages</span>
                  {summary.start_date && summary.end_date && (
                    <span>
                      {new Date(summary.start_date).toLocaleDateString()} - {new Date(summary.end_date).toLocaleDateString()}
                    </span>
                  )}
                  <span>Created: {new Date(summary.created_at).toLocaleString()}</span>
                </div>
                <div className="summary-content">
                  <p>{summary.summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
