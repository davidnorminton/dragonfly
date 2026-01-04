import { useTraffic } from '../hooks/useTraffic';

export function Traffic() {
  const { traffic, loading } = useTraffic();

  if (loading || !traffic) {
    return (
      <div className="widget">
        <div className="widget-title">Traffic Conditions</div>
        <div>Loading...</div>
      </div>
    );
  }

  const summary = traffic.summary || {};
  const location = traffic.location || {};

  // Format delay time
  const formatDelay = (seconds) => {
    if (!seconds || seconds === 0) return 'No delay';
    const mins = Math.floor(seconds / 60);
    if (mins < 1) return '< 1 min';
    return `${mins} min${mins > 1 ? 's' : ''}`;
  };

  // Get status color
  const getStatusColor = (status) => {
    if (!status) return '#808080';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('clear') || statusLower.includes('light')) return '#4caf50';
    if (statusLower.includes('moderate')) return '#ff9800';
    if (statusLower.includes('heavy')) return '#f44336';
    return '#808080';
  };

  const statItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };

  return (
    <div className="widget">
      <div className="widget-title">Traffic Conditions</div>
      <div className="widget-content">
        {/* Summary Table */}
        <div className="stat-box" style={{ marginBottom: '0.5em' }}>
          <div className="stat-item" style={statItemStyle}>
            <div className="stat-label">Total Incidents</div>
            <div className="stat-value">{summary.total_incidents !== undefined ? summary.total_incidents : 0}</div>
          </div>
          <div className="stat-item" style={statItemStyle}>
            <div className="stat-label">Alerts</div>
            <div className="stat-value">{summary.total_alerts !== undefined ? summary.total_alerts : 0}</div>
          </div>
          <div className="stat-item" style={statItemStyle}>
            <div className="stat-label">Jams</div>
            <div className="stat-value">{summary.total_jams !== undefined ? summary.total_jams : 0}</div>
          </div>
        </div>
        
        <div className="stat-box">
          <div className="stat-item" style={statItemStyle}>
            <div className="stat-label">Status</div>
            <div 
              className="stat-value" 
              style={{ color: getStatusColor(summary.current_status) }}
            >
              {summary.current_status || 'No data'}
            </div>
          </div>
        </div>
        
        {summary.average_speed !== undefined && summary.average_speed !== null && (
          <div className="stat-box">
            <div className="stat-item" style={statItemStyle}>
              <div className="stat-label">Avg Speed</div>
              <div className="stat-value">{Math.round(summary.average_speed)} mph</div>
            </div>
          </div>
        )}

        {summary.delay_seconds !== undefined && summary.delay_seconds !== null && (
          <div className="stat-box">
            <div className="stat-item" style={statItemStyle}>
              <div className="stat-label">Delay</div>
              <div className="stat-value">{formatDelay(summary.delay_seconds)}</div>
            </div>
          </div>
        )}

        {summary.severity_breakdown && (
          (summary.severity_breakdown.major > 0 || 
           summary.severity_breakdown.moderate > 0 || 
           summary.severity_breakdown.minor > 0) && (
            <div className="stat-box">
              {summary.severity_breakdown.major > 0 && (
                <div className="stat-item" style={statItemStyle}>
                  <div className="stat-label">Major</div>
                  <div className="stat-value" style={{ color: '#f44336' }}>
                    {summary.severity_breakdown.major}
                  </div>
                </div>
              )}
              {summary.severity_breakdown.moderate > 0 && (
                <div className="stat-item" style={statItemStyle}>
                  <div className="stat-label">Moderate</div>
                  <div className="stat-value" style={{ color: '#ff9800' }}>
                    {summary.severity_breakdown.moderate}
                  </div>
                </div>
              )}
              {summary.severity_breakdown.minor > 0 && (
                <div className="stat-item" style={statItemStyle}>
                  <div className="stat-label">Minor</div>
                  <div className="stat-value" style={{ color: '#4caf50' }}>
                    {summary.severity_breakdown.minor}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {location.radius_miles && (
          <div style={{ fontSize: '0.8em', color: '#808080', marginTop: '0.5em' }}>
            Monitoring {location.radius_miles} miles radius
          </div>
        )}

        {traffic.api_status === 'not_configured' && (
          <div style={{ fontSize: '0.8em', color: '#ff9800', marginTop: '0.5em' }}>
            Traffic API not configured. Add Waze RapidAPI key to enable.
          </div>
        )}
      </div>
    </div>
  );
}
