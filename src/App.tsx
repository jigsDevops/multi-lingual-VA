import React, { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

// Register Chart.js components globally (or move to where charts are used)
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);


function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true); // State to track auth status loading

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false); // Auth state determined
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = () => {
    // User is already set by onAuthStateChanged, but we could force a refresh if needed
    // For now, this function primarily signals the Login component is done.
    console.log("Login successful, user state updated by auth listener.");
  };

   const handleLogout = () => {
    // User state will be set to null by onAuthStateChanged
    console.log("Logout initiated, user state will be updated by auth listener.");
  };

  // Show loading indicator while checking auth status
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
         <span className="ml-3 text-gray-600">Authenticating...</span>
      </div>
    );
  }

  // Render Login or Dashboard based on authentication state
  return user ? <Dashboard user={user} onLogout={handleLogout} /> : <Login onLoginSuccess={handleLoginSuccess} />;
}

export default App;
