import { useState, useEffect } from 'react';
import { octopusAPI } from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function OctopusEnergy() {
  const [data, setData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);
  const [activeChart, setActiveChart] = useState(0); // 0 = consumption over time, 1 = daily consumption

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await octopusAPI.getConsumption();
        console.log('Octopus Energy API response:', result);
        
        if (result.success === false) {
          setError(result.error || result.message || 'Failed to load energy data');
          setData(null);
        } else if (result.results && result.results.length > 0) {
          setData(result);
          setError(null);
        } else {
          setError('No consumption data available');
          setData(null);
        }
      } catch (err) {
        console.error('Error fetching Octopus Energy data:', err);
        setError(err.message || 'Failed to load energy data');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const historyResult = await octopusAPI.getHistory(days);
        if (historyResult.success && historyResult.data) {
          setHistoryData(historyResult.data);
        }
      } catch (err) {
        console.error('Error fetching history:', err);
      }
    };

    fetchHistory();
  }, [days]);

  if (loading) {
    return (
      <div className="widget">
        <div className="widget-title">Energy Usage</div>
        <div>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="widget">
        <div className="widget-title">Energy Usage</div>
        <div className="widget-error">Error: {error}</div>
      </div>
    );
  }

  if (!data || !data.results || data.results.length === 0) {
    return (
      <div className="widget">
        <div className="widget-title">Energy Usage</div>
        <div className="widget-error">
          {error || 'No consumption data available'}
        </div>
      </div>
    );
  }

  // Get the most recent readings (already reversed in backend)
  const recentReadings = data.results.slice(0, 10);
  
  // Calculate total consumption for today (if we have today's data)
  const today = new Date().toISOString().split('T')[0];
  const todayReadings = recentReadings.filter(r => r.interval_start.startsWith(today));
  const todayTotal = todayReadings.reduce((sum, r) => sum + (r.consumption || 0), 0);
  const todayCost = todayReadings.reduce((sum, r) => sum + (r.cost_pounds || 0), 0);
  
  // Get tariff info
  const tariff = data?.tariff;
  const isPrepay = tariff?.is_prepay || false;

  // Prepare consumption chart data
  const consumptionChartData = historyData ? {
    labels: historyData.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
    }),
    datasets: [
      {
        label: 'Consumption (kWh)',
        data: historyData.map(item => item.consumption),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
      }
    ]
  } : null;

  // Prepare daily consumption chart data
  const dailyConsumptionData = historyData && historyData.length > 0 ? (() => {
    // Group consumption by day
    const dailyTotals = {};
    
    historyData.forEach(item => {
      const date = new Date(item.date);
      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!dailyTotals[dayKey]) {
        dailyTotals[dayKey] = 0;
      }
      dailyTotals[dayKey] += item.consumption || 0;
    });
    
    // Sort by date
    const sortedDays = Object.keys(dailyTotals).sort();
    
    return {
      labels: sortedDays.map(day => {
        const date = new Date(day);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
          datasets: [
        {
          label: 'Daily Consumption (kWh)',
          data: sortedDays.map(day => dailyTotals[day]),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 1,
        }
      ]
    };
  })() : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(59, 130, 246, 0.5)',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#8e8ea0',
          maxRotation: 45,
          minRotation: 45,
        }
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#8e8ea0',
        },
        beginAtZero: true,
      }
    }
  };

  const dailyChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        title: {
          display: true,
          text: 'Consumption (kWh)',
          color: '#8e8ea0',
        }
      }
    }
  };

  return (
    <div className="widget">
      <div className="widget-title">Energy Usage</div>
      <div className="octopus-energy-content">
        <div className="octopus-energy-main">
          {todayTotal > 0 && (
            <div className="octopus-energy-stat">
              <div className="stat-box-label">Today's Total</div>
              <div className="stat-box-value">{todayTotal.toFixed(2)} kWh</div>
              {todayCost > 0 && (
                <div className="stat-box-cost">£{todayCost.toFixed(2)}</div>
              )}
            </div>
          )}
          {isPrepay && (
            <div className="octopus-energy-stat octopus-prepay-notice">
              <div className="stat-box-label">Prepay Meter</div>
              <div className="stat-box-value" style={{ fontSize: '0.85em', color: '#8e8ea0' }}>
                Balance/credit not available via API. Check your meter or Octopus app.
              </div>
            </div>
          )}
          {tariff && tariff.unit_rate && (
            <div className="octopus-energy-stat">
              <div className="stat-box-label">Current Rate</div>
              <div className="stat-box-value" style={{ fontSize: '0.9em' }}>
                {(tariff.unit_rate / 100).toFixed(2)}p/kWh
              </div>
            </div>
          )}
        </div>
        
        {(consumptionChartData || dailyConsumptionData) && (
          <div className="octopus-energy-chart">
            <div className="octopus-energy-chart-header">
              {consumptionChartData && dailyConsumptionData && (
                <button
                  className="octopus-energy-nav-arrow octopus-energy-nav-left"
                  onClick={() => setActiveChart((prev) => (prev === 0 ? 1 : 0))}
                  title="Previous chart"
                  aria-label="Previous chart"
                >
                  ‹
                </button>
              )}
              {!consumptionChartData && !dailyConsumptionData && <div></div>}
              <div className="octopus-energy-chart-title">
                {activeChart === 0 ? 'Consumption Over Time' : 'Consumption Per Day'}
                {activeChart === 0 && consumptionChartData && (
                  <select 
                    value={days} 
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="octopus-energy-days-select"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value={1}>Last 24 hours</option>
                    <option value={3}>Last 3 days</option>
                    <option value={7}>Last 7 days</option>
                    <option value={14}>Last 14 days</option>
                    <option value={30}>Last 30 days</option>
                  </select>
                )}
              </div>
              {consumptionChartData && dailyConsumptionData && (
                <button
                  className="octopus-energy-nav-arrow octopus-energy-nav-right"
                  onClick={() => setActiveChart((prev) => (prev === 0 ? 1 : 0))}
                  title="Next chart"
                  aria-label="Next chart"
                >
                  ›
                </button>
              )}
              {!consumptionChartData && !dailyConsumptionData && <div></div>}
            </div>
            <div className="octopus-energy-chart-container">
              {activeChart === 0 && consumptionChartData && (
                <Line data={consumptionChartData} options={chartOptions} />
              )}
              {activeChart === 1 && dailyConsumptionData && (
                <Bar data={dailyConsumptionData} options={dailyChartOptions} />
              )}
            </div>
            {consumptionChartData && dailyConsumptionData && (
              <div className="octopus-energy-chart-indicator">
                <span className={activeChart === 0 ? 'active' : ''}></span>
                <span className={activeChart === 1 ? 'active' : ''}></span>
              </div>
            )}
          </div>
        )}
        
      </div>
    </div>
  );
}
