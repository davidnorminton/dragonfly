"""FastAPI application for the web GUI."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi import Request
import logging
from typing import Optional
from core.processor import Processor

logger = logging.getLogger(__name__)

app = FastAPI(title="Dragonfly Home Assistant")

# This will be set by the main application
processor: Optional[Processor] = None


@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    """Serve the main web interface."""
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dragonfly Home Assistant</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        h1 { font-size: 2.5em; margin-bottom: 10px; }
        .status { 
            display: inline-block;
            padding: 5px 15px;
            background: rgba(255,255,255,0.2);
            border-radius: 20px;
            font-size: 0.9em;
        }
        .status.connected { background: rgba(76, 175, 80, 0.3); }
        .status.disconnected { background: rgba(244, 67, 54, 0.3); }
        .content {
            padding: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }
        .panel {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 20px;
        }
        .panel h2 {
            margin-bottom: 20px;
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .job-list {
            max-height: 400px;
            overflow-y: auto;
        }
        .job-item {
            background: white;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
        }
        .job-item.pending { border-left-color: #ffc107; }
        .job-item.running { border-left-color: #2196f3; }
        .job-item.completed { border-left-color: #4caf50; }
        .job-item.failed { border-left-color: #f44336; }
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .job-id {
            font-family: monospace;
            font-size: 0.9em;
            color: #666;
        }
        .job-status {
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .status-pending { background: #fff3cd; color: #856404; }
        .status-running { background: #cfe2ff; color: #084298; }
        .status-completed { background: #d1e7dd; color: #0f5132; }
        .status-failed { background: #f8d7da; color: #842029; }
        .job-service {
            font-weight: bold;
            color: #667eea;
        }
        .controls {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1em;
            transition: border-color 0.3s;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1em;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        button:active { transform: translateY(0); }
        .log {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
        }
        @media (max-width: 768px) {
            .content { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🪶 Dragonfly Home Assistant</h1>
            <div class="status disconnected" id="status">Disconnected</div>
        </header>
        <div class="content">
            <div class="panel">
                <h2>Job Queue</h2>
                <div class="job-list" id="jobList">
                    <p style="color: #999; text-align: center; padding: 20px;">No jobs yet</p>
                </div>
            </div>
            <div class="panel">
                <h2>Controls</h2>
                <div class="controls">
                    <select id="serviceSelect">
                        <option value="ai_service">AI Service (General Questions)</option>
                        <option value="rag_service">RAG Service (Personal Data)</option>
                    </select>
                    <textarea id="inputData" placeholder='{"question": "Your question here"}' rows="4"></textarea>
                    <button onclick="submitJob()">Submit Job</button>
                </div>
                <h2 style="margin-top: 30px;">System Log</h2>
                <div class="log" id="log">Connecting...</div>
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let jobs = {};

        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                updateStatus(true);
                addLog('Connected to server');
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleMessage(data);
            };

            ws.onclose = () => {
                updateStatus(false);
                addLog('Disconnected from server');
                setTimeout(connect, 3000);
            };

            ws.onerror = (error) => {
                addLog('WebSocket error: ' + error);
            };
        }

        function updateStatus(connected) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = connected ? 'Connected' : 'Disconnected';
            statusEl.className = 'status ' + (connected ? 'connected' : 'disconnected');
        }

        function handleMessage(data) {
            if (data.type === 'job_update') {
                updateJob(data.job);
            } else if (data.type === 'log') {
                addLog(data.message);
            }
        }

        function updateJob(jobData) {
            jobs[jobData.job_id] = jobData;
            renderJobs();
        }

        function renderJobs() {
            const jobList = document.getElementById('jobList');
            const jobArray = Object.values(jobs).sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });

            if (jobArray.length === 0) {
                jobList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No jobs yet</p>';
                return;
            }

            jobList.innerHTML = jobArray.map(job => `
                <div class="job-item ${job.status}">
                    <div class="job-header">
                        <span class="job-service">${job.service_name}</span>
                        <span class="job-status status-${job.status}">${job.status.toUpperCase()}</span>
                    </div>
                    <div class="job-id">ID: ${job.job_id}</div>
                    ${job.output_data ? `<div style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 5px;">
                        <strong>Output:</strong> ${JSON.stringify(job.output_data, null, 2)}
                    </div>` : ''}
                    ${job.error_message ? `<div style="margin-top: 10px; padding: 10px; background: #fee; border-radius: 5px; color: #c00;">
                        <strong>Error:</strong> ${job.error_message}
                    </div>` : ''}
                </div>
            `).join('');
        }

        async function submitJob() {
            const serviceName = document.getElementById('serviceSelect').value;
            const inputText = document.getElementById('inputData').value;
            
            try {
                const inputData = JSON.parse(inputText);
                
                const response = await fetch('/api/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        service_name: serviceName,
                        data: inputData
                    })
                });

                const result = await response.json();
                addLog(`Job submitted: ${result.job_id}`);
                
                // Poll for job status
                pollJobStatus(result.job_id);
            } catch (error) {
                addLog('Error submitting job: ' + error.message);
                alert('Error: ' + error.message);
            }
        }

        async function pollJobStatus(jobId) {
            const interval = setInterval(async () => {
                try {
                    const response = await fetch(`/api/jobs/${jobId}`);
                    const job = await response.json();
                    
                    if (job) {
                        updateJob(job);
                        if (job.status === 'completed' || job.status === 'failed') {
                            clearInterval(interval);
                        }
                    }
                } catch (error) {
                    clearInterval(interval);
                }
            }, 1000);
        }

        function addLog(message) {
            const logEl = document.getElementById('log');
            const timestamp = new Date().toLocaleTimeString();
            logEl.textContent += `[${timestamp}] ${message}\n`;
            logEl.scrollTop = logEl.scrollHeight;
        }

        connect();
    </script>
</body>
</html>
    """


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    await websocket.accept()
    try:
        while True:
            # Just keep connection alive for now
            # Real-time updates can be sent here
            data = await websocket.receive_text()
            # Echo back or handle message
            await websocket.send_json({"type": "echo", "data": data})
    except WebSocketDisconnect:
        pass


@app.post("/api/jobs")
async def create_job(request: Request):
    """Create a new job via HTTP API."""
    data = await request.json()
    service_name = data.get("service_name")
    input_data = data.get("data", {})
    
    if not processor:
        return {"error": "Processor not initialized"}
    
    job_id = await processor.job_manager.submit_job(
        service_name=service_name,
        input_data=input_data
    )
    
    return {"job_id": job_id, "service_name": service_name}


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """Get job status."""
    if not processor:
        return {"error": "Processor not initialized"}
    
    status = await processor.job_manager.get_job_status(job_id)
    return status or {"error": "Job not found"}


@app.get("/api/jobs")
async def list_jobs():
    """List all jobs (placeholder)."""
    return {"jobs": []}

