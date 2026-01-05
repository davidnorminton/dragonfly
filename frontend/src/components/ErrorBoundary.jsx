import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget">
          <div className="widget-title">{this.props.widgetName || 'Widget'}</div>
          <div className="widget-content" style={{ color: '#ff6b6b', fontSize: '0.9em', padding: '1rem' }}>
            Error loading widget. Please refresh the page.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

