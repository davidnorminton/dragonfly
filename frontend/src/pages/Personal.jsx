import { useState, useEffect } from 'react';
import './Personal.css';

const PERSONAL_SESSION_ID = 'personal-chat';

export function PersonalPage() {
  const [messages, setMessages] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [newSummary, setNewSummary] = useState(null);
  const [summaries, setSummaries] = useState([]);

  useEffect(() => {
    loadMessages();
    loadSummaries();
  }, []);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/personal/chat/history?session_id=${PERSONAL_SESSION_ID}&limit=1000`);
      const result = await response.json();
      if (result.success) {
        // Group messages into Q&A pairs
        const pairs = [];
        let currentPair = null;
        
        result.messages.forEach((msg) => {
          if (msg.role === 'user') {
            // Start a new pair
            if (currentPair) {
              pairs.push(currentPair);
            }
            currentPair = {
              id: `pair-${msg.id}`,
              questionId: msg.id,
              question: msg.message,
              questionDate: msg.created_at,
              answerId: null,
              answer: null,
              answerDate: null
            };
          } else if (msg.role === 'assistant' && currentPair) {
            // Add answer to current pair
            currentPair.answerId = msg.id;
            currentPair.answer = msg.message;
            currentPair.answerDate = msg.created_at;
            pairs.push(currentPair);
            currentPair = null;
          }
        });
        
        // Add last pair if it exists
        if (currentPair) {
          pairs.push(currentPair);
        }
        
        setMessages(pairs);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSummaries = async () => {
    try {
      const response = await fetch(`/api/personal/summaries?session_id=${PERSONAL_SESSION_ID}`);
      const result = await response.json();
      if (result.success) {
        setSummaries(result.summaries || []);
      }
    } catch (err) {
      console.error('Error loading summaries:', err);
    }
  };

  const handleToggleItem = (pairId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(pairId)) {
      newSelected.delete(pairId);
    } else {
      newSelected.add(pairId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === messages.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(messages.map(m => m.id)));
    }
  };

  const handleSummarize = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one Q&A pair to summarize');
      return;
    }

    setSummarizing(true);
    try {
      // Get selected messages
      const selectedPairs = messages.filter(m => selectedItems.has(m.id));
      
      // Build text from selected pairs
      const textToSummarize = selectedPairs.map(pair => {
        return `Question: ${pair.question}\nAnswer: ${pair.answer || 'No answer yet'}`;
      }).join('\n\n---\n\n');

      // Get date range from selected pairs
      const dates = selectedPairs
        .flatMap(p => [p.questionDate, p.answerDate])
        .filter(d => d)
        .map(d => new Date(d))
        .sort((a, b) => a - b);

      const startDate = dates.length > 0 ? dates[0].toISOString() : null;
      const endDate = dates.length > 0 ? dates[dates.length - 1].toISOString() : null;

      // Create summary via API
      const response = await fetch('/api/personal/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: PERSONAL_SESSION_ID,
          title: `Summary ${new Date().toLocaleDateString()}`,
          summary: textToSummarize, // Will be summarized by AI if not provided
          message_count: selectedPairs.length,
          start_date: startDate,
          end_date: endDate,
          message_ids: selectedPairs.flatMap(p => [p.questionId, p.answerId]).filter(id => id)
        })
      });

      const result = await response.json();
      if (result.success) {
        setNewSummary(result.summary);
        await loadSummaries();
        setSelectedItems(new Set());
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Error creating summary:', err);
      alert(`Error creating summary: ${err.message}`);
    } finally {
      setSummarizing(false);
    }
  };

  const handleViewSummary = (summary) => {
    setNewSummary(summary);
  };

  const handleCloseSummary = () => {
    setNewSummary(null);
  };

  if (loading) {
    return (
      <div className="personal-page">
        <div className="loading">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="personal-page">
      <div className="personal-main-container">
        <div className="personal-left-pane">
          <div className="personal-header">
            <h1>Personal Chat Summaries</h1>
            <div className="personal-actions">
              <button
                className="btn-select-all"
                onClick={handleSelectAll}
              >
                {selectedItems.size === messages.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                className="btn-summarize"
                onClick={handleSummarize}
                disabled={summarizing || selectedItems.size === 0}
              >
                {summarizing ? 'Summarizing...' : `Summarize (${selectedItems.size})`}
              </button>
            </div>
          </div>

          <div className="messages-list">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>No Q&A pairs found in personal chat.</p>
              </div>
            ) : (
              messages.map((pair) => (
                <div
                  key={pair.id}
                  className={`message-item ${selectedItems.has(pair.id) ? 'selected' : ''}`}
                >
                  <label className="message-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(pair.id)}
                      onChange={() => handleToggleItem(pair.id)}
                    />
                    <span className="checkbox-custom"></span>
                  </label>
                  <div className="message-content">
                    <div className="message-question">
                      <strong>Q:</strong> {pair.question}
                    </div>
                    {pair.answer && (
                      <div className="message-answer">
                        <strong>A:</strong> {pair.answer}
                      </div>
                    )}
                    <div className="message-date">
                      {new Date(pair.questionDate).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {newSummary && (
          <div className="personal-right-pane">
            <div className="summary-header">
              <h2>{newSummary.title || 'Summary'}</h2>
              <button
                className="btn-close"
                onClick={handleCloseSummary}
              >
                ×
              </button>
            </div>
            <div className="summary-meta">
              <span>{newSummary.message_count || 0} messages</span>
              {newSummary.start_date && newSummary.end_date && (
                <span>
                  {new Date(newSummary.start_date).toLocaleDateString()} - {new Date(newSummary.end_date).toLocaleDateString()}
                </span>
              )}
              <span>Created: {new Date(newSummary.created_at).toLocaleString()}</span>
            </div>
            <div className="summary-content">
              <p>{newSummary.summary}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
