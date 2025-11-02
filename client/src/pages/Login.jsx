import './Login.css';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import loginBg from '../assets/login-bg.png';
import { useRef, useState } from 'react';

export default function Login() {
  const API = (
    process.env.REACT_APP_API_URL ||
    process.env.REACT_APP_API_BASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [warning, setWarning] = useState('');
  const toastLock = useRef(false);

  const showToast = (msg) => {   
    if (toastLock.current) return;
    toastLock.current = true;
    setWarning(msg);
    setTimeout(() => {
      setWarning('');
      toastLock.current = false;
    }, 3000);
  };

  if (user) {
    if (user.role === 'admin') return <Navigate to="/admin-dashboard" />;
    if (user.role === 'mentor') return <Navigate to="/mentor-dashboard" />;
    return <Navigate to="/student-dashboard" />;
  }

  const handleLogin = async (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      const { email, name, sub: googleId, picture } = decoded;

      if (!email.endsWith('@mmdc.mcl.edu.ph')) {
        showToast('Only MMDC emails (@mmdc.mcl.edu.ph) are allowed');
        return;
      }

      // Determine role (or get it back from your API/JWT)
      const derivedRole = email.includes('lr.') ? 'student' : 'mentor';

      const res = await axios.post(`${API}/api/auth/google`, {
        email, name, googleId, photoUrl: picture, role: derivedRole
      });

      const token = res.data.token;
      login(token);

      // Pick target route from the *authoritative* source (prefer token, then API, then fallback)
      let roleFromToken = '';
      try {
        roleFromToken = jwtDecode(token)?.role || '';
      } catch {}
      const role = roleFromToken || res.data?.user?.role || derivedRole;

      const target =
        role === 'admin' ? '/admin-dashboard' :
        role === 'mentor' ? '/mentor-dashboard' :
        '/student-dashboard';

      // Hard refresh to ensure all providers/hooks re-init with the new auth state
      window.location.replace(target); // replaces history so Back won't return to /login
    } catch (err) {
      console.error(err);
      showToast('Login failed');
    }
  };

  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      {warning && (
        <div className="toast-warning" role="status" aria-live="polite">
          {warning}
        </div>
      )}
      <div className="login-wrapper"
      //style={{
        //backgroundImage: `url(${loginBg})`,
      //}}/
      >
        <div className="login-card">
          <div className="tooltip-wrapper top-right">
            <img src="/info.png" alt="Info" className="info-icon" />
            <div className="tooltip-text">Only MMDC emails (@mmdc.mcl.edu.ph) are accepted</div>
          </div>
          <img src="/mentease-logo-landscape.png" alt="MentEase Logo" className="logo" />
  
          <div className="description">
            <p>A mentoring platform for</p>
            <img 
              src="/mmdc-logo.png" 
              alt="MMDC Logo" 
              className="mmdc-logo-line"
            />
          </div>

          <div className="google-wrapper">
            <GoogleLogin
              onSuccess={handleLogin}
              onError={() => alert('Login error')}
              theme="filled_blue"
              shape="pill"
              width="300"
            />
            <p className="email-note">Only MMDC emails (@mmdc.mcl.edu.ph) are accepted</p>
          </div>
          <p className="support">
            Having trouble? Contact <span
              onClick={() => navigate('/test-student-dashboard')}
              style={{ cursor: 'pointer', color: '#64748b', textDecoration: 'underline' }}
            >
              support
            </span>.
          </p>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
