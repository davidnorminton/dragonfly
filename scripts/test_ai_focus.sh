#!/bin/bash
#
# AI Focus Mode Test Runner
# Runs all tests and generates performance reports
#

set -e  # Exit on error

echo "=================================================="
echo "AI FOCUS MODE - TEST SUITE"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if pytest is available
if ! command -v pytest &> /dev/null; then
    echo -e "${RED}❌ pytest not found. Please install: pip install pytest pytest-asyncio httpx${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Running Tests...${NC}"
echo ""

# Run text cleaning unit tests
echo "1️⃣  Running Text Cleaning Tests..."
pytest tests/integration/test_ai_focus_mode.py::TestTextCleaning -v --tb=short || echo -e "${RED}✗ Text cleaning tests failed${NC}"
echo ""

# Run API endpoint integration tests
echo "2️⃣  Running API Endpoint Tests..."
pytest tests/integration/test_ai_focus_mode.py::TestAIFocusEndpoints -v --tb=short || echo -e "${RED}✗ API tests failed${NC}"
echo ""

# Run TTS streaming tests
echo "3️⃣  Running TTS Streaming Tests..."
pytest tests/integration/test_ai_focus_mode.py::TestTextToAudioStreaming -v --tb=short || echo -e "${RED}✗ TTS tests failed${NC}"
echo ""

# Run performance tests
echo "4️⃣  Running Performance Tests..."
pytest tests/integration/test_ai_focus_mode.py::TestAIFocusPerformance -v --tb=short || echo -e "${RED}✗ Performance tests failed${NC}"
echo ""

# Run optimization validation
echo "5️⃣  Running Optimization Validation..."
pytest tests/performance/test_ai_focus_performance.py::TestOptimizationTargets -v --tb=short || echo -e "${RED}✗ Optimization tests failed${NC}"
echo ""

# Run memory/resource tests
echo "6️⃣  Running Resource Management Tests..."
pytest tests/performance/test_ai_focus_performance.py::TestMemoryUsage -v --tb=short || echo -e "${RED}✗ Resource tests failed${NC}"
echo ""

echo "=================================================="
echo -e "${GREEN}✅ Test Suite Complete!${NC}"
echo "=================================================="
echo ""
echo "📊 View detailed performance report:"
echo "   cat AI_FOCUS_TEST_REPORT.md"
echo ""
echo "🔍 Run specific test:"
echo "   pytest tests/integration/test_ai_focus_mode.py::TestTextCleaning::test_apostrophe_removal -v"
echo ""
echo "📈 Run with coverage:"
echo "   pytest tests/ --cov=services --cov=utils --cov-report=html"
echo ""
