import { z } from 'zod'

const emailZ = z.string().trim().min(1, 'Email is required').email('Enter a valid email')

export const passwordZ = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')

export const loginFormSchema = z.object({
  email: emailZ,
  password: z.string().min(1, 'Password is required').max(128),
})

export const createOrganizerFormSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Name is required').max(120),
    email: emailZ,
    password: passwordZ,
    confirmPassword: z.string(),
    assigned_sports: z.array(z.string()).min(1, 'Assign at least one sport'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function staffDomainEmailSchema(staffDomain: string) {
  const d = staffDomain.trim().toLowerCase()
  return emailZ.refine((e) => e.toLowerCase().endsWith(`@${d}`), {
    message: `Super admin must use a staff email @${d}`,
  })
}

export function studentDomainEmailSchema(studentDomain: string) {
  const d = studentDomain.trim().toLowerCase()
  return emailZ.refine((e) => e.toLowerCase().endsWith(`@${d}`), {
    message: `Use your student email @${d}`,
  })
}

/** Initial super admin — any valid work email (domains are configured in a later step). */
export const setupSuperAdminSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(120),
    email: emailZ.transform((e) => e.trim()),
    password: passwordZ,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

const isoDateZ = z
  .string()
  .min(1, 'Date is required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')

export const setupInstitutionSchema = z.object({
  name: z.string().trim().min(1, 'School name is required').max(200),
  abbreviation: z.string().trim().min(1, 'Abbreviation is required').max(32),
  tagline: z.string().trim().max(200).optional().default(''),
  primary_color: z.string().min(1),
  secondary_color: z.string().min(1),
  address: z.string().trim().max(500).optional().default(''),
  region: z.string().trim().max(100).optional().default(''),
  logo_url: z
    .union([z.string().url('Enter a valid logo URL or upload an image'), z.literal('')])
    .optional()
    .default(''),
})

const domainPartZ = z
  .string()
  .trim()
  .min(3, 'Enter a valid domain (e.g. mail.university.edu)')
  .max(120)
  .regex(/^[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/i, 'Invalid domain format')

export const setupDomainsSchema = z
  .object({
    staff: domainPartZ,
    student: domainPartZ,
  })
  .refine((d) => d.staff.trim().toLowerCase() !== d.student.trim().toLowerCase(), {
    message: 'Staff and student domains must be different',
    path: ['student'],
  })

export const setupSeasonSchema = z
  .object({
    name: z.string().trim().min(1, 'Season name is required').max(80),
    start_date: isoDateZ,
    end_date: isoDateZ,
  })
  .refine((s) => s.end_date >= s.start_date, {
    message: 'End date must be on or after start date',
    path: ['end_date'],
  })

export const setupSportsSchema = z.array(z.string()).min(1, 'Choose at least one sport')

/** Athlete registration — account step */
export const registerAccountSchema = (studentDomain: string) => {
  const d = studentDomain.trim().toLowerCase()
  return z
    .object({
      full_name: z.string().trim().min(2, 'Enter your full name').max(120),
      email: emailZ.transform((e) => e.trim()),
      password: passwordZ,
    })
    .refine((f) => f.email.toLowerCase().endsWith(`@${d}`), {
      message: `Use your school email @${d}`,
      path: ['email'],
    })
}

export const registerStudentProfileSchema = z.object({
  student_id: z.string().trim().min(3, 'Student ID is required').max(32),
  year_level: z.string().trim().min(1),
  department: z.string().trim().min(2, 'Department / course is required').max(120),
})

export const registerProfileSchema = z.object({
  student_id: z.string().trim().min(3, 'Student ID is required').max(32),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
  position: z.string().trim().min(1, 'Choose a position'),
  jersey_number: z.string().trim().max(8).optional().default(''),
  year_level: z.string().trim().min(1),
  department: z.string().trim().min(2, 'Department / course is required').max(120),
})
