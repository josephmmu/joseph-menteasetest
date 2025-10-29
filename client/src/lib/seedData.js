// Shared seed data used by admin pages so counts stay consistent
// Note: this is a client-side seeded dataset for demo/prototyping only.

// Users (excerpted realistic pool used by AdminUserManagement)
export const ALL_USERS = [
  {
    name: "Anna Villanueva",
    email: "lr.avillanueva@mmdc.mcl.edu.ph",
    role: "student",
    program: "BA",
  },
  {
    name: "Carlos Rodriguez",
    email: "lr.crodriguez@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Elena Martinez",
    email: "lr.emartinez@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Diego Santos",
    email: "lr.dsantos@mmdc.mcl.edu.ph",
    role: "student",
    program: "BA",
  },
  {
    name: "Sophia Chen",
    email: "lr.schen@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Miguel Torres",
    email: "lr.mtorres@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Isabella Garcia",
    email: "lr.igarcia@mmdc.mcl.edu.ph",
    role: "student",
    program: "BA",
  },
  {
    name: "Alexander Cruz",
    email: "lr.acruz@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Victoria Reyes",
    email: "lr.vreyes@mmdc.mcl.edu.ph",
    role: "student",
    program: "BA",
  },
  {
    name: "Lucas Fernandez",
    email: "lr.lfernandez@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Camila Morales",
    email: "lr.cmorales@mmdc.mcl.edu.ph",
    role: "student",
    program: "BA",
  },
  {
    name: "Sebastian Rivera",
    email: "lr.srivera@mmdc.mcl.edu.ph",
    role: "student",
    program: "IT",
  },
  {
    name: "Maria Santos",
    email: "msantos@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "IT",
  },
  {
    name: "Juan Dela Cruz",
    email: "jdelacruz@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "BA",
  },
  {
    name: "Robert Johnson",
    email: "rjohnson@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "IT",
  },
  {
    name: "Sarah Wilson",
    email: "swilson@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "BA",
  },
  {
    name: "Michael Brown",
    email: "mbrown@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "IT",
  },
  {
    name: "Lisa Martinez",
    email: "lmartinez@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "GE",
  },
  {
    name: "David Thompson",
    email: "dthompson@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "GE",
  },
  {
    name: "Patricia Lee",
    email: "plee@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "GE",
  },
  {
    name: "Jennifer Garcia",
    email: "jgarcia@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "GE",
  },
  {
    name: "Mark Rodriguez",
    email: "mrodriguez@mmdc.mcl.edu.ph",
    role: "mentor",
    program: "GE",
  },
  {
    name: "Althea Lim",
    email: "alim@mmdc.mcl.edu.ph",
    role: "admin",
    program: null,
  },
  {
    name: "Bea Castillo",
    email: "bcastillo@mmdc.mcl.edu.ph",
    role: "admin",
    program: null,
  },
  {
    name: "Christian Lopez",
    email: "clopez@mmdc.mcl.edu.ph",
    role: "admin",
    program: null,
  },
];

// Courses seed (makeInitialCoursesByPeriod simplified and compatible with AdminCourseManagement)
const keyOf = (year, term) => `y${year}-t${term}`;
const generateCourseInstanceId = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `course_${timestamp}_${randomPart}`;
};

export function makeInitialCoursesByPeriod() {
  const data = {};
  for (let year = 1; year <= 5; year++) {
    for (let term = 1; term <= 3; term++) {
      data[keyOf(year, term)] = [];
    }
  }

  data[keyOf(3, 1)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT115",
      courseName: "Object-Oriented Analysis and Design",
      section: "H3103",
      program: "IT",
      assignedMentor: "Maria Santos",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT114",
      courseName: "Mobile Development Fundamentals",
      section: "A3101",
      program: "IT",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT117",
      courseName: "Data Visualization Techniques",
      section: "H3102",
      program: "IT",
      assignedMentor: "Robert Johnson",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT161",
      courseName: "Web Systems and Technology",
      section: "S3101",
      program: "IT",
      assignedMentor: "Michael Brown",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT151",
      courseName: "Platform Technologies",
      section: "A3102",
      program: "IT",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-SS041",
      courseName: "The Life and Works of Rizal",
      section: "H3101",
      program: "GE",
      assignedMentor: "Lisa Martinez",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA111",
      courseName: "Strategic Management",
      section: "A3201",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA106",
      courseName: "Marketing Management",
      section: "H3202",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT124",
      courseName: "System Integration and Architecture",
      section: "H3105",
      program: "IT",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 3,
    },
  ];

  data[keyOf(3, 2)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT200D1",
      courseName: "Capstone 1",
      section: "A3103",
      program: "IT",
      assignedMentor: "David Thompson",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT149",
      courseName: "Web Technology Application",
      section: "H3104",
      program: "IT",
      assignedMentor: "Patricia Lee",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT118",
      courseName: "Cloud Computing",
      section: "S3102",
      program: "IT",
      assignedMentor: "Jennifer Garcia",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-SS086",
      courseName: "Gender and Society",
      section: "A3104",
      program: "GE",
      assignedMentor: "Mark Rodriguez",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA200D1",
      courseName: "Business Administration Capstone",
      section: "H3203",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 2,
      schoolYear: 3,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA108",
      courseName: "Financial Management",
      section: "A3204",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 2,
      schoolYear: 3,
    },
  ];

  data[keyOf(2, 1)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT104",
      courseName: "Computer Networks",
      section: "A2101",
      program: "IT",
      assignedMentor: "Maria Santos",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT105",
      courseName: "Human-Computer Interaction",
      section: "H2102",
      program: "IT",
      assignedMentor: "Robert Johnson",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-IT112",
      courseName: "Technical Support",
      section: "S2101",
      program: "IT",
      assignedMentor: "Michael Brown",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA103",
      courseName: "Principles of Management",
      section: "A2201",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA105",
      courseName: "Introduction to Accounting",
      section: "H2202",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 2,
    },
  ];

  data[keyOf(1, 1)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA101",
      courseName: "Fundamentals of Business Administration",
      section: "A1101",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 1,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA102",
      courseName: "Business Communication",
      section: "H1102",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 1,
      schoolYear: 1,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA104",
      courseName: "Business Mathematics",
      section: "S1103",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 1,
      schoolYear: 1,
    },
  ];

  data[keyOf(2, 2)] = [
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA107",
      courseName: "Human Resource Management",
      section: "A2201",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 2,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA109",
      courseName: "Operations Management",
      section: "H2202",
      program: "BA",
      assignedMentor: "Juan Dela Cruz",
      term: 2,
      schoolYear: 2,
    },
    {
      id: generateCourseInstanceId(),
      courseCode: "MO-BA110",
      courseName: "Business Ethics and Social Responsibility",
      section: "S2203",
      program: "BA",
      assignedMentor: "Sarah Wilson",
      term: 2,
      schoolYear: 2,
    },
  ];

  // add one more IT course to y3-t1 to match other pages
  data[keyOf(3, 1)].push({
    id: generateCourseInstanceId(),
    courseCode: "MO-IT124",
    courseName: "System Integration and Architecture",
    section: "H3105",
    program: "IT",
    assignedMentor: "Juan Dela Cruz",
    term: 1,
    schoolYear: 3,
  });

  // attach createdAt timestamps
  let ts = Date.now();
  Object.keys(data).forEach((k) => {
    data[k].forEach((c, i) => {
      c.createdAt = new Date(ts - i * 1000 * 60).toISOString();
    });
  });

  return data;
}

// Generate sessions from course instances (lightweight generator compatible with AdminSessionAnalytics)
export function generateSessionsFromCourses(coursesByPeriod) {
  const COURSE_INSTANCES = Object.values(coursesByPeriod).flat();
  const STUDENT_NAMES = [
    "Alex Cruz",
    "Bea Santos",
    "Carlos Reyes",
    "Danica Lopez",
    "Elijah Navarro",
    "Francesca Dela Rosa",
    "Gabriel Mendoza",
    "Hannah Garcia",
    "Ian Flores",
    "Janet Ramos",
    "Kevin Aquino",
    "Leah Ramirez",
    "Miguel Ortiz",
    "Nina Villanueva",
    "Oscar Bautista",
    "Paula Gonzales",
    "Quincy dela Cruz",
    "Rosa Fernandez",
    "Samuel Torres",
    "Tessa Morales",
  ];

  const MORNING_TIMES = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM"];
  const AFTERNOON_TIMES = ["1:00 PM", "1:30 PM", "2:00 PM", "3:00 PM"];
  const EVENING_TIMES = ["4:00 PM", "4:30 PM", "5:30 PM", "6:00 PM"];

  const TOPICS_BY_COURSE = {
    "MO-IT104": [
      "Network Security Fundamentals",
      "OSI Model and TCP/IP",
      "Routing Basics",
      "Subnetting and IP Addressing",
    ],
    "MO-IT115": ["UML Diagrams", "Design Patterns", "Use Case Modeling"],
  };
  const GENERIC_TOPICS = [
    "Introduction / Overview",
    "Review & Q&A",
    "Assessment / Short Quiz",
    "Practice Exercises",
    "Project Guidance",
    "Exam Prep",
  ];

  const sessions = [];
  let sessionId = 1;

  COURSE_INSTANCES.forEach((course) => {
    // create 3 sessions per course as a modest sample
    for (let i = 0; i < 3; i++) {
      const student =
        STUDENT_NAMES[Math.floor(Math.random() * STUDENT_NAMES.length)];
      const timePool =
        course.section && course.section.startsWith("A")
          ? MORNING_TIMES
          : course.section.startsWith("H")
          ? AFTERNOON_TIMES
          : EVENING_TIMES;
      const time = timePool[Math.floor(Math.random() * timePool.length)];
      const topicList = TOPICS_BY_COURSE[course.courseCode] || GENERIC_TOPICS;
      const topic = topicList[Math.floor(Math.random() * topicList.length)];
      const statusRand = Math.random();
      const status =
        statusRand < 0.75
          ? "Completed"
          : statusRand < 0.85
          ? "Missed - Student"
          : statusRand < 0.95
          ? "Missed - Mentor"
          : "Cancelled";

      sessions.push({
        id: `sess_${sessionId++}`,
        courseId: course.id,
        subject: `${course.courseCode} ${course.courseName}`,
        student,
        mentor: course.assignedMentor,
        program: course.program,
        section: course.section,
        time,
        topic,
        status,
        schoolYear: course.schoolYear,
        term: course.term,
        createdAt: new Date(
          Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)
        ).toISOString(),
      });
    }
  });

  return sessions;
}

// Convenience exports used by AdminDashboard
export const COURSES_BY_PERIOD = makeInitialCoursesByPeriod();
export const ALL_COURSES = Object.values(COURSES_BY_PERIOD).flat();
export const GENERATED_SESSIONS =
  generateSessionsFromCourses(COURSES_BY_PERIOD);
