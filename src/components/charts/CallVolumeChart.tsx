import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';
import { ChartData } from '../../types';

ChartJS.register(BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

interface CallVolumeChartProps {
  data: ChartData | null;
}

const CallVolumeChart: React.FC<CallVolumeChartProps> = ({ data }) => {
  if (!data || !data.labels || data.labels.length === 0) {
    return <p className="text-center text-gray-500 py-4">No call volume data available.</p>;
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Call Volume by Day',
        font: {
          size: 16,
        },
        padding: {
          bottom: 20,
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1, // Ensure y-axis shows whole numbers for call counts
        },
      },
    },
  };

  return <Bar options={options} data={data} />;
};

export default CallVolumeChart;
