<h1 align="center">📘 MentEase</h1>
<p align="center"><strong>A Mentoring Platform for Scheduling, Feedback, and Collaborative Growth</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/status-in%20development-blue" alt="Project Status">
</p>

<hr/>

<h2>🚀 Overview</h2>
<p>
MentEase is a web-based mentoring platform developed for Mapúa Malayan Digital College (MMDC). It simplifies the mentoring process for students, mentors, and admins by streamlining scheduling, session notes, feedback, and performance tracking.
</p>

<h2>🎯 Features</h2>
<ul>
  <li>📅 <strong>Session Scheduling</strong> – Book sessions based on course schedules and mentor availability.</li>
  <li>📝 <strong>Session Notes</strong> – Mentors and students can collaborate on notes during and after sessions.</li>
  <li>📊 <strong>Feedback System</strong> – Give and receive constructive feedback after each mentoring session.</li>
  <li>👩‍🏫 <strong>Admin Dashboard</strong> – Manage users, assign mentors, and monitor session analytics.</li>
  <li>🔐 <strong>Authentication</strong> – Role-based access (Student, Mentor, Admin) with JWT-secured login.</li>
  <li>📎 <strong>Google Meet Integration</strong> – One-click access to mentoring sessions via pre-set meeting links.</li>
</ul>

<h2>🛠️ Tech Stack</h2>
<ul>
  <li><strong>Frontend:</strong> React, CSS Modules</li>
  <li><strong>Backend:</strong> Node.js, Express.js</li>
  <li><strong>Database:</strong> MongoDB Atlas</li>
  <li><strong>Containerization:</strong> Docker + Docker Compose</li>
  <li><strong>Authentication:</strong> JSON Web Tokens (JWT)</li>
  <li><strong>Deployment:</strong> Render</li>
</ul>

<h2>📂 Folder Structure (Client)</h2>

<pre>
src/
├── components/         # Reusable UI components (modals, cards, etc.)
├── pages/              # Page-level React components
├── context/            # Global context providers (e.g. Auth, CourseColor)
├── utils/              # Utility functions (e.g. validation, formatting)
├── assets/             # Images, logos, and static files
└── App.js              # Main routing logic
</pre>

<h2>🔧 Setup Instructions</h2>

<ol>
  <li>Clone the repository</li>
  <li>Set up your <code>.env</code> file.</li>
  <li>Build and start all services using Docker Compose:
    <pre><code>docker-compose up --build -d</code></pre>
  </li>
  <li>Open your browser and go to:
    <pre><code>http://localhost:3000</code></pre>
  </li>
</ol>

<h2>🧑‍💻 Team Members</h2>
<ul>
  <li>Cristobal, Rei Emmanuel</li>
  <li>Esperas, Jodienne</li>
  <li>Rondina, Aldrich Rosh</li>
  <li>Sales, Joseph</li>
</ul>

