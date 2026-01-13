import { useState, useRef, useEffect } from 'react';

export function PasscodeModal({ isOpen, onClose, onVerify, userName }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPasscode('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    try {
      const isValid = await onVerify(passcode);
      if (isValid) {
        setPasscode('');
        onClose();
      } else {
        setError('Incorrect passcode. Please try again.');
        setPasscode('');
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } catch (err) {
      setError('Error verifying passcode. Please try again.');
      console.error('Passcode verification error:', err);
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = () => {
    setPasscode('');
    setError('');
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10002,
        backdropFilter: 'blur(4px)'
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          background: 'rgba(20, 20, 30, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '32px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 style={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: '600',
          marginBottom: '8px'
        }}>
          Admin Passcode Required
        </h2>
        <p style={{
          color: '#9da7b8',
          fontSize: '0.95rem',
          marginBottom: '24px'
        }}>
          Enter the passcode for <strong style={{ color: '#fff' }}>{userName}</strong> to switch to this admin account.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '0.9rem',
              color: '#9da7b8',
              fontWeight: '500'
            }}>
              Passcode
            </label>
            <input
              ref={inputRef}
              type="password"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setError('');
              }}
              placeholder="Enter passcode"
              disabled={verifying}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: error ? '1px solid rgba(244, 67, 54, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(102, 126, 234, 0.5)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? 'rgba(244, 67, 54, 0.5)' : 'rgba(255, 255, 255, 0.1)';
              }}
            />
            {error && (
              <div style={{
                marginTop: '8px',
                color: '#f44336',
                fontSize: '0.85rem'
              }}>
                {error}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={verifying}
              style={{
                padding: '10px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#9da7b8',
                cursor: verifying ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!verifying) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={(e) => {
                if (!verifying) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#9da7b8';
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying || !passcode.trim()}
              style={{
                padding: '10px 20px',
                background: verifying || !passcode.trim() 
                  ? 'rgba(102, 126, 234, 0.3)' 
                  : 'rgba(102, 126, 234, 0.2)',
                border: '1px solid rgba(102, 126, 234, 0.4)',
                borderRadius: '8px',
                color: '#667eea',
                cursor: verifying || !passcode.trim() ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (!verifying && passcode.trim()) {
                  e.currentTarget.style.background = 'rgba(102, 126, 234, 0.3)';
                  e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                if (!verifying && passcode.trim()) {
                  e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
                }
              }}
            >
              {verifying ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
