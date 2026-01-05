import { useState } from 'react';
import { actionsAPI } from '../services/api';

export function QuickActions() {
  const [actioning, setActioning] = useState(null);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null);

  const handleAction = async (action) => {
    setActioning(action);
    setMessage(null);
    
    try {
      const result = await actionsAPI.executeAction(action);
      setMessage(result.message || 'Action completed successfully');
      setMessageType('success');
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (err) {
      console.error(`Error executing ${action}:`, err);
      setMessage(err.response?.data?.detail || `Failed to execute ${action}`);
      setMessageType('error');
      
      setTimeout(() => {
        setMessage(null);
      }, 5000);
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="widget">
      <div className="widget-title">Quick Actions</div>
      <div className="widget-content">
        {message && (
          <div className={`action-message ${messageType}`}>
            {message}
          </div>
        )}
        <div className="actions-grid">
          <button
            className="action-button"
            onClick={() => handleAction('refresh_data')}
            disabled={actioning !== null}
          >
            {actioning === 'refresh_data' ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button
            className="action-button"
            onClick={() => handleAction('clear_cache')}
            disabled={actioning !== null}
          >
            {actioning === 'clear_cache' ? 'Clearing...' : 'Clear Cache'}
          </button>
          <button
            className="action-button"
            onClick={() => handleAction('test_connections')}
            disabled={actioning !== null}
          >
            {actioning === 'test_connections' ? 'Testing...' : 'Test Connections'}
          </button>
        </div>
      </div>
    </div>
  );
}


