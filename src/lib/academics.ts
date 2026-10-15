/*
 * Reference lists for the registration form: every Nigerian state, and the courses offered
 * across Nigerian universities, polytechnics and colleges of education, grouped by faculty.
 * Each course appears once, so its faculty can be looked up from the course name.
 */

export const STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
  "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

export const LEVELS = ["100", "200", "300", "400", "500", "600"];

export const OTHER_FACULTY = "Other";

export const DEPARTMENTS: { faculty: string; departments: string[] }[] = [
  {
    faculty: "Agriculture",
    departments: [
      "Agribusiness", "Agricultural Economics", "Agricultural Extension and Rural Development", "Agronomy", "Animal Science",
      "Crop Protection", "Crop Science", "Fisheries and Aquaculture", "Food Science and Technology", "Forestry and Wildlife Management",
      "Home Science and Management", "Horticulture", "Soil Science", "Water Resources Management and Agrometeorology",
    ],
  },
  {
    faculty: "Arts and Humanities",
    departments: [
      "Arabic Studies", "Archaeology", "Chinese Studies", "Christian Religious Studies", "Classics", "Creative Arts",
      "English and Literary Studies", "English Language", "Film Studies", "Fine and Applied Arts", "French", "German",
      "Hausa", "History and International Studies", "Igbo", "Islamic Studies", "Linguistics", "Music", "Philosophy",
      "Religious Studies", "Russian", "Theatre Arts", "Yoruba",
    ],
  },
  {
    faculty: "Education",
    departments: [
      "Adult Education", "Agricultural Education", "Business Education", "Early Childhood Education", "Education and Biology",
      "Education and Chemistry", "Education and Computer Science", "Education and Economics", "Education and English Language",
      "Education and Geography", "Education and Mathematics", "Education and Physics", "Education and Political Science",
      "Educational Management", "Educational Technology", "Guidance and Counselling", "Home Economics Education",
      "Human Kinetics and Health Education", "Library and Information Science", "Primary Education", "Social Studies Education",
      "Special Education", "Technical Education",
    ],
  },
  {
    faculty: "Engineering and Technology",
    departments: [
      "Aerospace Engineering", "Agricultural and Biosystems Engineering", "Automotive Engineering", "Biomedical Engineering",
      "Chemical Engineering", "Civil Engineering", "Computer Engineering", "Electrical and Electronics Engineering",
      "Electronics and Telecommunication Engineering", "Environmental Engineering", "Food Engineering", "Gas Engineering",
      "Industrial and Production Engineering", "Information and Communication Engineering", "Marine Engineering",
      "Materials and Metallurgical Engineering", "Mechanical Engineering", "Mechatronics Engineering", "Mining Engineering",
      "Petroleum Engineering", "Polymer and Textile Engineering", "Structural Engineering", "Systems Engineering",
      "Water Resources and Environmental Engineering",
    ],
  },
  {
    faculty: "Environmental Sciences",
    departments: [
      "Architecture", "Building", "Estate Management", "Environmental Management", "Industrial Design", "Quantity Surveying",
      "Surveying and Geoinformatics", "Urban and Regional Planning",
    ],
  },
  {
    faculty: "Health and Medical Sciences",
    departments: [
      "Anatomy", "Dentistry", "Environmental Health Science", "Health Information Management", "Human Nutrition and Dietetics",
      "Medical Laboratory Science", "Medicine and Surgery", "Nursing Science", "Occupational Therapy", "Optometry",
      "Pharmacology", "Pharmacy", "Physiology", "Physiotherapy", "Prosthetics and Orthotics", "Public Health", "Radiography",
    ],
  },
  {
    faculty: "Law",
    departments: ["Common Law", "Islamic Law", "Law"],
  },
  {
    faculty: "Management Sciences",
    departments: [
      "Accounting", "Actuarial Science", "Banking and Finance", "Business Administration", "Entrepreneurship", "Finance",
      "Hospitality Management", "Human Resource Management", "Industrial Relations and Personnel Management", "Insurance",
      "Local Government Studies", "Logistics and Supply Chain Management", "Marketing", "Office Technology and Management",
      "Procurement Management", "Project Management", "Public Administration", "Taxation", "Tourism Management",
      "Transport Management",
    ],
  },
  {
    faculty: "Sciences",
    departments: [
      "Applied Geology", "Artificial Intelligence", "Biochemistry", "Biology", "Biotechnology", "Botany", "Chemistry",
      "Computer Science", "Cyber Security", "Data Science", "Environmental Science", "Forensic Science", "Genetics",
      "Geology", "Geophysics", "Industrial Chemistry", "Industrial Mathematics", "Industrial Physics", "Information Systems",
      "Information Technology", "Marine Science", "Mathematics", "Meteorology", "Microbiology", "Physics",
      "Science Laboratory Technology", "Software Engineering", "Statistics", "Zoology",
    ],
  },
  {
    faculty: "Social Sciences",
    departments: [
      "Anthropology", "Broadcasting", "Criminology and Security Studies", "Demography and Social Statistics",
      "Development Studies", "Economics", "Geography", "International Relations", "Journalism", "Mass Communication",
      "Peace and Conflict Studies", "Political Science", "Psychology", "Public Relations and Advertising", "Social Work",
      "Sociology",
    ],
  },
  {
    faculty: "Veterinary Medicine",
    departments: ["Veterinary Medicine"],
  },
  {
    faculty: OTHER_FACULTY,
    departments: ["Other (not listed)"],
  },
];

export function facultyOf(department: string) {
  return DEPARTMENTS.find((f) => f.departments.includes(department))?.faculty ?? "";
}

export function coursesIn(faculty: string) {
  return DEPARTMENTS.find((f) => f.faculty === faculty)?.departments ?? [];
}

/** The saved faculty if it's one we list, otherwise work it out from the course (older records). */
export function resolveFaculty(faculty: string | undefined, department: string) {
  return faculty && DEPARTMENTS.some((f) => f.faculty === faculty) ? faculty : facultyOf(department);
}
