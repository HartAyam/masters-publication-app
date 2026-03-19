import { BrowserRouter as Router } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Files Deleted</h1>
          <p className="text-gray-700 mb-4">
            It appears that almost all files in the project were accidentally deleted.
            The application cannot load its original content.
          </p>
          <p className="text-gray-500 text-sm">
            Please let me know if you would like to rebuild the application from scratch.
          </p>
        </div>
      </div>
    </Router>
  );
}

export default App;
