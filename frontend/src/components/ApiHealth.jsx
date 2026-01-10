import { useState } from 'react';
import { useApiHealth } from '../hooks/useApiHealth';

export function ApiHealth() {
  const { health, loading, error, lastChecked, refresh } = useApiHealth();
  const [expandedError, setExpandedError] = useState(null);

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok':
        return <span className="api-status-icon ok">✓</span>;
      case 'error':
        return <span className="api-status-icon error">✗</span>;
      case 'not_configured':
        return <span className="api-status-icon not-configured">○</span>;
      default:
        return <span className="api-status-icon unknown">?</span>;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'ok':
        return 'status-ok';
      case 'error':
        return 'status-error';
      case 'not_configured':
        return 'status-not-configured';
      default:
        return 'status-unknown';
    }
  };

  const getErrorMessage = (api) => {
    if (api.error) return api.error;
    if (api.note) return api.note;
    if (api.code && api.code !== 200) return `HTTP ${api.code}`;
    return null;
  };

  const toggleError = (key) => {
    setExpandedError(expandedError === key ? null : key);
  };

  if (loading && !health) {
    return (
      <div className="widget api-health-widget">
        <div className="widget-title">
          <span>API Status</span>
        </div>
        <div className="api-health-loading">Checking APIs...</div>
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="widget api-health-widget">
        <div className="widget-title">
          <span>API Status</span>
          <button className="api-health-refresh" onClick={refresh} title="Refresh">
            ↻
          </button>
        </div>
        <div className="api-health-error">Failed to check APIs</div>
      </div>
    );
  }

  const apis = health?.apis || {};
  const summary = health?.summary || {};

  return (
    <div className="widget api-health-widget">
      <div className="widget-title">
        <span>API Status</span>
        <button 
          className={`api-health-refresh ${loading ? 'spinning' : ''}`} 
          onClick={refresh} 
          title="Refresh"
          disabled={loading}
        >
          ↻
        </button>
      </div>
      
      <div className="api-health-summary">
        {summary.all_healthy ? (
          <span className="summary-ok">✓ All systems operational</span>
        ) : summary.configured > 0 ? (
          <span className="summary-warning">
            {summary.healthy}/{summary.configured} APIs healthy
          </span>
        ) : (
          <span className="summary-none">No APIs configured</span>
        )}
      </div>

      <div className="api-health-list">
        {Object.entries(apis).map(([key, api]) => {
          const errorMsg = getErrorMessage(api);
          const isExpanded = expandedError === key;
          
          return (
            <div key={key} className="api-health-item-wrapper">
              <div className={`api-health-item ${getStatusClass(api.status)}`}>
                {getStatusIcon(api.status)}
                <span className="api-name">{api.name}</span>
                {errorMsg && (
                  <button
                    className={`api-info-btn ${isExpanded ? 'active' : ''}`}
                    onClick={() => toggleError(key)}
                    title={isExpanded ? 'Hide details' : 'Show details'}
                    aria-label={isExpanded ? 'Hide error details' : 'Show error details'}
                  >
                    ⓘ
                  </button>
                )}
              </div>
              {isExpanded && errorMsg && (
                <div className="api-error-details">
                  {errorMsg}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lastChecked && (
        <div className="api-health-footer">
          Last checked: {formatTime(lastChecked)}
        </div>
      )}
    </div>
  );
}
