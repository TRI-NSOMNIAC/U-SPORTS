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

export function setupSuperAdminSchema(staffDomain: string, studentDomain: string) {
  const staff = staffDomain.trim().toLowerCase()
  const student = studentDomain.trim().toLowerCase()
  return z
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
    .refine((d) => d.email.toLowerCase().endsWith(`@${staff}`), {
      message: `Super admin must use staff email @${staff} (not @${student})`,
      path: ['email'],
    })
    .refine((d) => !d.email.toLowerCase().endsWith(`@${student}`), {
      message: 'Athletes use student email during registration — use your staff domain here',
      path: ['email'],
    })
}

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
})

const domainPartZ = z
  .string()
  .trim()
  .min(3, 'Enter a domain like nu-dasma.edu.ph')
  .max(120)
  .regex(/^[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/i, 'Invalid domain format')

export const setupDomainsSchema = z.object({
  staff: domainPartZ,
  student: domainPartZ,
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

export const registerProfileSchema = z.object({
  student_id: z.string().trim().min(3, 'Student ID is required').max(32),
  sport: z.enum(['basketball', 'volleyball', 'table-tennis']),
  position: z.string().trim().min(1, 'Choose a position'),
  jersey_number: z.string().trim().max(8).optional().default(''),
  year_level: z.string().trim().min(1),
  department: z.string().trim().min(2, 'Department / course is required').max(120),
})
