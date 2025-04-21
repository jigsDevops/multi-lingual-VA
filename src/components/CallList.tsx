import React from 'react';
import { CallAnalytic } from '../types';
import { Phone, Clock, Smile, MessageSquare, Languages } from 'lucide-react';

interface CallListProps {
  calls: CallAnalytic[];
}

const CallList: React.FC<CallListProps> = ({ calls }) => {
  if (calls.length === 0) {
    return <p className="text-center text-gray-500 py-4">No recent calls found.</p>;
  }

  const formatDate = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  };

  const getSentimentIcon = (sentiment: CallAnalytic['sentiment']) => {
    switch (sentiment) {
      case 'positive': return <Smile size={16} className="text-green-500 mr-1" />;
      case 'negative': return <Smile size={16} className="text-red-500 mr-1 rotate-180" />; // Simple way to show frown
      case 'neutral': return <Smile size={16} className="text-yellow-500 mr-1" />;
      default: return <Smile size={16} className="text-gray-400 mr-1" />;
    }
  };

  return (
    <div className="space-y-4">
      {calls.slice(0, 10).map((call) => ( // Display latest 10 calls
        <div key={call.callId} className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow duration-200 border border-gray-200">
          <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
            <span className="flex items-center"><Clock size={14} className="mr-1" /> {formatDate(call.timestamp)}</span>
            <span className="flex items-center"><Phone size={14} className="mr-1" /> Duration: {call.duration}s</span>
          </div>
          <div className="flex items-center space-x-4 mb-3">
             <span className="flex items-center text-sm capitalize">
               {getSentimentIcon(call.sentiment)} {call.sentiment}
             </span>
             <span className="flex items-center text-sm"><Languages size={16} className="text-blue-500 mr-1" /> {call.detectedLanguage}</span>
          </div>
          <details className="group">
             <summary className="text-sm text-gray-600 cursor-pointer group-hover:text-indigo-600 flex items-center">
                <MessageSquare size={14} className="mr-1"/> Transcript
             </summary>
             <p className="mt-2 text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 max-h-32 overflow-y-auto">
                {call.transcript || "No transcript available."}
             </p>
          </details>
        </div>
      ))}
    </div>
  );
};

export default CallList;
