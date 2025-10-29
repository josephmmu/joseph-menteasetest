import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

// Create the context
const SystemSettingsContext = createContext();

// Custom hook to use the system settings
export const useSystemSettings = () => {
  const context = useContext(SystemSettingsContext);
  if (!context) {
    throw new Error(
      "useSystemSettings must be used within a SystemSettingsProvider"
    );
  }
  return context;
};

// The old DEFAULT_SETTINGS and generateAcademicYears are no longer the primary source.
// We'll keep a simpler default for the initial render before data is fetched.
const INITIAL_STATE = {
  currentTerm: null,
  currentAcademicYearLabel: "Loading...",
  // We can keep the calendar structure if other parts of the app use it,
  // but the primary data will come from the fetched active term.
  academicCalendar: {},
};

// System Settings Provider Component
export const SystemSettingsProvider = ({ children }) => {
  const [systemSettings, setSystemSettings] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(true);

  // Wrap fetch logic in useCallback so we can export it
  const fetchActiveTerm = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(
        "http://localhost:5001/api/academic-terms/active",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const activeTerm = await response.json();
        if (activeTerm) {
          setSystemSettings((prev) => ({
            ...prev,
            currentTerm: activeTerm.term,
            currentAcademicYearLabel: `SY ${activeTerm.schoolYear}`,
            activeTermId: activeTerm.termId, // to keep the real db id
            academicCalendar: {
              ...prev.academicCalendar,
              active: {
                start: activeTerm.startDate,
                end: activeTerm.endDate,
                name: `Term ${activeTerm.term}`,
              },
            },
          }));
        } else {
          setSystemSettings((prev) => ({
            ...prev,
            currentAcademicYearLabel: "No Active Term",
          }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch active term:", error);
      setSystemSettings((prev) => ({
        ...prev,
        currentAcademicYearLabel: "Error",
      }));
    } finally {
      setLoading(false);
    }
  }, []); // useCallback dependency array is empty

  // Call the function in useEffect on initial load
  useEffect(() => {
    fetchActiveTerm();
  }, [fetchActiveTerm]);

  // Refresh active term when auth token changes within this tab
  useEffect(() => {
    const onAuthTokenChanged = () => {
      fetchActiveTerm();
    };
    window.addEventListener('auth-token-changed', onAuthTokenChanged);
    return () => window.removeEventListener('auth-token-changed', onAuthTokenChanged);
  }, [fetchActiveTerm]);

  // Ensure first interactive focus after cold start pulls active term
  useEffect(() => {
    const onFocus = () => {
      if (!systemSettings?.currentTerm) {
        fetchActiveTerm();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchActiveTerm, systemSettings?.currentTerm]);

  // The helper functions now become much simpler. They just read from state.
  const getCurrentAcademicYearLabel = () => {
    return systemSettings.currentAcademicYearLabel;
  };

  const getCurrentTermDetails = () => {
    // This now returns the details of the fetched active term
    return systemSettings.academicCalendar.active || {};
  };

  // This function is no longer needed for determining the current year,
  // but might be useful elsewhere. If not, it can be removed.
  const getAcademicYears = () => {
    // This is now disconnected from the active term logic.
    // You could fetch a list of all unique school years from the DB if needed.
    return [];
  };

  // The save/update functions are now handled by the AdminSystemSettings page.
  // This provider's role is to READ the active setting for the rest of the app.

  // Derive a full academicTerm object from systemSettings
  const academicTerm = useMemo(() => {
    if (
      !systemSettings?.currentTerm ||
      !systemSettings?.currentAcademicYearLabel
    ) {
      return null;
    }
    const yearMatch =
      systemSettings.currentAcademicYearLabel.match(/(\d{4})-(\d{4})/);
    if (!yearMatch) return null;
    return {
      _id: systemSettings.activeTermId, // real ObjectId from API
      term: systemSettings.currentTerm,
      schoolYear: `${yearMatch[1]}-${yearMatch[2]}`,
      startYear: parseInt(yearMatch[1]),
      endYear: parseInt(yearMatch[2]),
    };
  }, [systemSettings]);

  const value = {
    systemSettings,
    academicTerm,
    loading,
    getCurrentAcademicYearLabel,
    getCurrentTermDetails,
    getAcademicYears,
    refreshActiveTerm: fetchActiveTerm,
    // You can remove the update/save functions from here as they are no longer used.
  };

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
};

export default SystemSettingsContext;
