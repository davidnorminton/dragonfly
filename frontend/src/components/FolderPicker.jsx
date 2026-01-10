import { useRef, useState } from 'react';

/**
 * FolderPicker component for selecting directories.
 * Uses HTML5 file input with webkitdirectory attribute.
 * Note: Browsers don't expose full paths for security, so we try to extract what we can
 * and also allow manual entry of full paths.
 */
export function FolderPicker({ value, onChange, placeholder, label, helpText, disabled = false, mode = 'folder' }) {
  const inputRef = useRef(null);
  const [browseHint, setBrowseHint] = useState('');

  const handleBrowse = async () => {
    // Try File System Access API first (Chrome/Edge - modern browsers)
    if (window.showDirectoryPicker) {
      try {
        const directoryHandle = await window.showDirectoryPicker();
        const dirName = directoryHandle.name;
        
        // For File System Access API, we can try to get more path information
        // by reading the directory structure or using the handle
        try {
          // Try to get the parent directory name by walking up
          // Unfortunately, File System Access API doesn't expose full paths
          // But we can try to construct a reasonable default path
          
          // Get the directory name
          const selectedDirName = dirName;
          
          // Try to detect the actual path using backend
          try {
            const response = await fetch('/api/system/detect-directory-path', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                directory_name: selectedDirName
              })
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.detected_path) {
                onChange(result.detected_path);
                const confidenceMsg = result.confidence === 'low' ? ' (suggested - please verify)' : '';
                setBrowseHint(`Selected folder: "${selectedDirName}" - Detected path: ${result.detected_path}${confidenceMsg}`);
                return;
              }
            }
          } catch (detectErr) {
            console.error('Error detecting path:', detectErr);
            // Fall through to fallback
          }
          
          // Fallback: construct a path
          let constructedPath = '';
          if (navigator.platform.toLowerCase().includes('win')) {
            constructedPath = `C:\\Users\\username\\${selectedDirName}`;
          } else if (navigator.platform.toLowerCase().includes('mac')) {
            constructedPath = `/Users/username/Documents/${selectedDirName}`;
          } else {
            constructedPath = `/home/username/${selectedDirName}`;
          }
          
          onChange(constructedPath);
          setBrowseHint(`Selected folder: "${selectedDirName}" - Path set to ${constructedPath}. Please replace "username" with your actual username.`);
        } catch (pathErr) {
          // Fallback: just set directory name
          onChange(dirName);
          setBrowseHint(`Selected folder: "${dirName}" - Please enter the full path manually`);
        }
        return;
      } catch (err) {
        // User cancelled - do nothing
        if (err.name !== 'AbortError') {
          console.error('Error selecting directory:', err);
        }
        return;
      }
    }
    
    // Fallback: Use webkitdirectory for older browsers
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      
      // Try to get the full path from the file object
      // Some browsers/environments expose this
      if (firstFile.path) {
        // Electron or Node.js environment - we can get full path
        const fullPath = firstFile.path.substring(0, firstFile.path.lastIndexOf('/'));
        onChange(fullPath);
        setBrowseHint('');
        // Reset input
        if (inputRef.current) {
          inputRef.current.value = '';
        }
        return;
      }
      
      // For webkitRelativePath, try to detect the actual path using backend
      if (firstFile.webkitRelativePath) {
        // webkitRelativePath is relative to the selected directory
        // If user selects /Users/davidnorminton/Documents/Eminem and file is song.mp3,
        // webkitRelativePath = "song.mp3" (just the filename)
        // If file is in subfolder album1/song.mp3, webkitRelativePath = "album1/song.mp3"
        
        // Collect all relative paths to help with detection
        const relativePaths = Array.from(files).slice(0, 10).map(f => f.webkitRelativePath);
        
        // Try to extract directory name - check if all paths start with the same prefix
        // This would indicate a subdirectory structure
        let dirName = '';
        if (relativePaths.length > 0) {
          const firstPath = relativePaths[0];
          const pathParts = firstPath.split('/');
          // If path has multiple parts, the first part might be a subdirectory
          // But we want the selected directory name, which we can't get directly
          // So we'll try to use the first part as a hint, or use file names to infer
          
          // For now, we'll need to prompt the user or try backend detection
          // Let's try backend detection with the first part of the path
          dirName = pathParts[0] || 'selected-folder';
        }
        
        // Try to detect the path using backend
        try {
          const response = await fetch('/api/system/detect-directory-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_paths: relativePaths,
              directory_name: dirName
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.detected_path) {
              onChange(result.detected_path);
              const confidenceMsg = result.confidence === 'low' ? ' (suggested - please verify)' : '';
              setBrowseHint(`Selected folder (${files.length} files found) - Detected path: ${result.detected_path}${confidenceMsg}`);
              // Reset input
              if (inputRef.current) {
                inputRef.current.value = '';
              }
              return;
            }
          }
        } catch (err) {
          console.error('Error detecting path:', err);
          // Fall through to fallback
        }
        
        // Fallback: construct a path
        // Since we can't get the exact directory name from webkitRelativePath alone,
        // we'll use a placeholder that the user can adjust
        let constructedPath = '';
        if (navigator.platform.toLowerCase().includes('win')) {
          constructedPath = `C:\\Users\\username\\selected-folder`;
        } else if (navigator.platform.toLowerCase().includes('mac')) {
          constructedPath = `/Users/username/Documents/selected-folder`;
        } else {
          constructedPath = `/home/username/selected-folder`;
        }
        
        onChange(constructedPath);
        setBrowseHint(`Selected folder (${files.length} files found) - Please enter the full path manually. Backend detection failed.`);
      } else if (firstFile.name) {
        // Fallback: use file name
        const dirName = firstFile.name.substring(0, firstFile.name.lastIndexOf('/')) || firstFile.name;
        let constructedPath = '';
        if (navigator.platform.toLowerCase().includes('win')) {
          constructedPath = `C:\\Users\\username\\${dirName}`;
        } else if (navigator.platform.toLowerCase().includes('mac')) {
          constructedPath = `/Users/username/Documents/${dirName}`;
        } else {
          constructedPath = `/home/username/${dirName}`;
        }
        onChange(constructedPath);
        setBrowseHint(`Selected: ${dirName} - Path set to ${constructedPath}, please adjust if needed`);
      }
    }
    // Reset input so same folder can be selected again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            onChange(e.target.value);
            setBrowseHint(''); // Clear hint when user types manually
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <input
          ref={inputRef}
          type="file"
          webkitdirectory={mode === 'folder' ? '' : undefined}
          directory={mode === 'folder' ? '' : undefined}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleBrowse}
          disabled={disabled}
          className="save-button"
          style={{ minWidth: '100px' }}
        >
          📁 Browse
        </button>
      </div>
      {browseHint && (
        <span className="form-help" style={{ fontSize: '0.85em', color: 'rgba(59, 130, 246, 0.8)', marginTop: '4px', display: 'block' }}>
          {browseHint}
        </span>
      )}
      {helpText && <span className="form-help">{helpText}</span>}
      {mode === 'folder' && !browseHint && (
        <span className="form-help" style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)', marginTop: '4px', display: 'block' }}>
          Click Browse to select a folder, then enter the full path manually if needed.
        </span>
      )}
    </div>
  );
}

/**
 * FilePicker component for selecting individual files.
 */
export function FilePicker({ value, onChange, placeholder, label, helpText, disabled = false, accept }) {
  const inputRef = useRef(null);
  const [browseHint, setBrowseHint] = useState('');

  const handleBrowse = async () => {
    // Try File System Access API first (Chrome/Edge - modern browsers)
    if (window.showOpenFilePicker) {
      try {
        const options = {};
        if (accept) {
          // Parse accept string (e.g., "audio/*" or ".mp3,.wav")
          const acceptTypes = accept.split(',').map(ext => ext.trim());
          const mimeTypes = acceptTypes.filter(t => t.includes('/'));
          const extensions = acceptTypes.filter(t => t.startsWith('.'));
          
          options.types = [{
            description: 'Files',
            accept: mimeTypes.length > 0 ? { [mimeTypes[0]]: extensions } : {}
          }];
        }
        
        const fileHandles = await window.showOpenFilePicker(options);
        const file = await fileHandles[0].getFile();
        setBrowseHint(`Selected file: "${file.name}" - Please enter the full path manually in the text field above`);
        // Note: We can't get the full path due to browser security, so user must enter it manually
        return;
      } catch (err) {
        // User cancelled - do nothing
        if (err.name !== 'AbortError') {
          console.error('Error selecting file:', err);
        }
        return;
      }
    }
    
    // Fallback: Use regular file input
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      if (file.path) {
        // Electron or Node.js environment - we can get full path
        onChange(file.path);
        setBrowseHint('');
      } else if (file.name) {
        // Browser - we can only get the filename
        setBrowseHint(`Selected: ${file.name} (enter full path manually)`);
      }
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => {
            onChange(e.target.value);
            setBrowseHint(''); // Clear hint when user types manually
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileChange}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleBrowse}
          disabled={disabled}
          className="save-button"
          style={{ minWidth: '100px' }}
        >
          📄 Browse
        </button>
      </div>
      {browseHint && (
        <span className="form-help" style={{ fontSize: '0.85em', color: 'rgba(59, 130, 246, 0.8)', marginTop: '4px', display: 'block' }}>
          {browseHint}
        </span>
      )}
      {helpText && <span className="form-help">{helpText}</span>}
      {!browseHint && (
        <span className="form-help" style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)', marginTop: '4px', display: 'block' }}>
          Click Browse to select a file, then enter the full path manually if needed.
        </span>
      )}
    </div>
  );
}
