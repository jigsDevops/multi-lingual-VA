import React, { useState, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, FirestoreError } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { CallAnalytic, ChartData } from '../types';
import CallVolumeChart from './charts/CallVolumeChart';
import SentimentChart from './charts/SentimentChart';
import LanguageChart from './charts/LanguageChart';
import CallList from './CallList';
import { LogOut, BarChart3, PieChart, Languages as LanguagesIcon, List } from 'lucide-react';

interface DashboardProps {
  user: User;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [callVolumeData, setCallVolumeData] = useState<ChartData | null>(null);
  const [sentimentData, setSentimentData] = useState<ChartData | null>(null);
  const [languageData, setLanguageData] = useState<ChartData | null>(null);
  const [analytics, setAnalytics] = useState<CallAnalytic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !user.email) return;

    setLoading(true);
    setError(null);

    const analyticsQuery = query(
      collection(db, 'call_analytics'),
      where('subscriberEmail', '==', user.email)
      // Consider adding orderBy('timestamp', 'desc') and limit() for performance
    );

    const unsubscribe = onSnapshot(analyticsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), callId: doc.id })) as CallAnalytic[];
      setAnalytics(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())); // Sort by newest first

      // Process data for charts
      processChartData(data);
      setLoading(false);
    }, (err: FirestoreError) => {
      console.error("Error fetching analytics:", err);
      setError("Failed to load call analytics. Please try again later.");
      setLoading(false);
    });

    // Cleanup listener on component unmount
    return () => unsubscribe();
  }, [user]);

  const processChartData = (data: CallAnalytic[]) => {
     // Call Volume (by day - simple aggregation)
    const volumeByDay: { [key: string]: number } = {};
    data.forEach(call => {
      try {
        const day = new Date(call.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        volumeByDay[day] = (volumeByDay[day] || 0) + 1;
      } catch (e) { console.warn("Invalid date format for call:", call.callId)}
    });
    // Sort volume by date for better chart readability
    const sortedVolumeEntries = Object.entries(volumeByDay).sort(([dayA], [dayB]) => {
        // Basic sort assuming 'MMM D' format, might need refinement for year changes
        const dateA = new Date(dayA + ', ' + new Date().getFullYear()); // Add year for Date parsing
        const dateB = new Date(dayB + ', ' + new Date().getFullYear());
        return dateA.getTime() - dateB.getTime();
    });
    setCallVolumeData({
      labels: sortedVolumeEntries.map(([day]) => day),
      datasets: [{ label: 'Call Volume', data: sortedVolumeEntries.map(([, count]) => count), backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }]
    });

    // Sentiment Distribution
    const sentimentCounts: { [key in CallAnalytic['sentiment']]: number } = { positive: 0, negative: 0, neutral: 0 };
    data.forEach(call => {
        if (call.sentiment && sentimentCounts.hasOwnProperty(call.sentiment)) {
            sentimentCounts[call.sentiment]++;
        }
    });
    setSentimentData({
      labels: ['Positive', 'Negative', 'Neutral'],
      datasets: [{ data: [sentimentCounts.positive, sentimentCounts.negative, sentimentCounts.neutral], backgroundColor: ['#4CAF50', '#F44336', '#FFC107'] }]
    });

    // Language Distribution
    const languageCounts: { [key: string]: number } = {};
    data.forEach(call => {
      const lang = call.detectedLanguage || 'Unknown';
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    });
    const languageColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40']; // Add more if needed
    setLanguageData({
      labels: Object.keys(languageCounts),
      datasets: [{ data: Object.values(languageCounts), backgroundColor: languageColors.slice(0, Object.keys(languageCounts).length) }]
    });
  };


  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (error) {
      console.error('Logout error:', error);
      // Optionally show an error message to the user
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-300">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
          Receptionist Dashboard
        </h1>
        <div className="flex items-center space-x-4">
           <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
           <button
             onClick={handleLogout}
             className="flex items-center bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition duration-300"
             title="Logout"
           >
             <LogOut size={16} className="mr-1" />
             <span className="hidden md:inline">Logout</span>
           </button>
        </div>
      </header>

      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-6 text-center">{error}</p>}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="ml-3 text-gray-600">Loading Analytics...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Charts Section */}
          <section>
             <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><BarChart3 size={20} className="mr-2 text-indigo-600"/>Call Volume & Sentiment</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg shadow h-64 md:h-80">
                  <CallVolumeChart data={callVolumeData} />
                </div>
                <div className="bg-white p-4 rounded-lg shadow h-64 md:h-80">
                  <SentimentChart data={sentimentData} />
                </div>
             </div>
          </section>

          {/* Language Chart Section */}
           <section>
             <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><LanguagesIcon size={20} className="mr-2 text-indigo-600"/>Language Distribution</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <div className="bg-white p-4 rounded-lg shadow h-64 md:h-80 md:col-span-1 lg:col-span-1">
                    <LanguageChart data={languageData} />
                 </div>
                 {/* Placeholder for potential future charts or info cards */}
                 <div className="hidden md:block md:col-span-1 lg:col-span-2"></div>
             </div>
           </section>


          {/* Recent Calls Section */}
          <section>
            <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><List size={20} className="mr-2 text-indigo-600"/>Recent Calls</h2>
            <div className="bg-white p-4 rounded-lg shadow">
              <CallList calls={analytics} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
