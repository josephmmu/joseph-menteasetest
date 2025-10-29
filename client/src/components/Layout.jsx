import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import './Layout.css';

export default function Layout({ children }) {
  return (
    <div className="student-dashboard">
      <Header />
      <div className="main-layout">
        <Sidebar />
        <main className="dashboard-main scrollable-content">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}