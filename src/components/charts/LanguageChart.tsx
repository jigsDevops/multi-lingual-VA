import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { ChartData } from '../../types';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

interface LanguageChartProps {
  data: ChartData | null;
}

const LanguageChart: React.FC<LanguageChartProps> = ({ data }) => {
  if (!data || !data.labels || data.datasets[0]?.data.every(d => d === 0)) {
    return <p className="text-center text-gray-500 py-4">No language data available.</p>;
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
        text: 'Language Distribution',
         font: {
          size: 16,
        },
         padding: {
          bottom: 20,
        }
      },
    },
  };

  return <Pie options={options} data={data} />;
};

export default LanguageChart;
