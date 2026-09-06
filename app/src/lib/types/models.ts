export type UserRole = 'admin' | 'officer' | 'student';
export type GoogleWalletDesign = 'builder' | 'legacy';
export type MemberStatus = 'Active' | 'Inactive';
export type EventStatus = 'Open' | 'Closed';
export type SlotType = 'am_in' | 'am_out' | 'pm_in' | 'pm_out' | 'other';
export type SlotStatus = 'upcoming' | 'active' | 'closed';
export type SemesterType = 'First Semester' | 'Second Semester';
export type YearLevel = '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
export type SyncStatus = 'pending_offline' | 'synced' | 'duplicate' | 'invalid' | 'error';
export type AttendanceStatus = 'on_time' | 'late' | 'manual';
export type EventWeight = number;

export interface SyncFailure {
  client_id: string;
  code: string;
  message: string;
  retriable: boolean;
  attempts: number;
  last_attempt_at: string;
}

export interface BadgeData {
  qr_payload: string;
  uid: string;
  student_number: string;
  full_name: string;
  course: string;
  year: YearLevel;
  block_label: string;
  status: MemberStatus;
  avatar_url: string | null;
}

export type SanctionPolicyMode = 'weighted_missed_points' | 'attendance_percentage';
export type SemesterAssessmentStatus = 'draft' | 'finalized' | 'corrected';

export interface SanctionTier {
  id: string;
  label: string;
  minimum_missed_points?: number;
  maximum_attendance_ratio?: number;
  obligation_text: string;
}

export interface SanctionPolicy {
  id: string;
  organization_id: string;
  name: string;
  version: number;
  mode: SanctionPolicyMode;
  is_active: boolean;
  tiers: SanctionTier[];
}

export interface SemesterAssessment {
  id: string;
  organization_id: string;
  student_id: string;
  term_key: string;
  policy_id: string;
  policy_version: number;
  status: SemesterAssessmentStatus;
  maximum_points: number;
  earned_points: number;
  missed_points: number;
  attendance_ratio: number;
  tier_label: string | null;
  tier_threshold: string | null;
  obligation_text: string | null;
  contributions: unknown[];
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LatePolicy {
  late_cutoff_at: string | null;
  late_penalty_percent: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  role: UserRole;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  organization_id: string;
  uid: string;
  student_number: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  course: string;
  year: YearLevel;
  section: string;
  status: MemberStatus;
  is_first_login: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ScannerStudent = Pick<Student, 'id' | 'organization_id' | 'uid' | 'student_number' | 'full_name' | 'status' | 'avatar_url'>;
export type BadgeStudent = Pick<Student, 'id' | 'uid' | 'student_number' | 'full_name' | 'course' | 'year' | 'section' | 'status' | 'avatar_url'>;

export interface Officer {
  id: string;
  organization_id: string;
  name: string;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface EventSlot {
  id: string;
  organization_id: string;
  event_id: string;
  label: string;
  slot_type: SlotType;
  opens_at: string;
  closes_at: string;
  late_cutoff_at: string | null;
  late_penalty_percent: number;
  is_required: boolean;
  status: SlotStatus;
  created_at: string;
}

export interface Event {
  id: string;
  organization_id: string;
  name: string;
  starts_at: string;
  venue: string;
  description: string;
  status: EventStatus;
  weight: EventWeight;
  /** Added by the Phase 5 migration; optional during rolling deployment. */
  term_key?: string;
  created_by_officer_id?: string | null;
  slots?: EventSlot[];
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  student_id: string;
  event_id: string;
  slot_id: string | null;
  officer_id: string | null;
  officer_name: string | null;
  client_id: string | null;
  recorded_at: string;
  effective_scan_time: string;
  attendance_status: AttendanceStatus;
  late_penalty_percent: number;
  earned_points_override: number | null;
  student?: Student;
  event?: Event;
  slot?: EventSlot;
}

export interface AttendanceRecordDetail extends Omit<AttendanceRecord, 'event' | 'slot'> {
  event: Pick<Event, 'id' | 'name' | 'weight' | 'term_key'> & { slots: EventSlot[] };
  slot: Pick<EventSlot, 'id' | 'label' | 'is_required'> | null;
}

export interface AttendanceCorrectionAudit {
  id: string;
  organization_id: string;
  attendance_record_id: string;
  student_id: string;
  event_id: string;
  action: 'update' | 'delete';
  corrected_by: string;
  reason: string;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface StudentAttendanceDetails {
  student: Pick<Student, 'id' | 'full_name' | 'student_number'>;
  records: AttendanceRecordDetail[];
  corrections: AttendanceCorrectionAudit[];
}

export interface OrganizationSettings {
  id: string;
  organization_id: string;
  academic_year: string;
  semester: SemesterType;
  admin_username?: string;
  sanctions_enabled?: boolean;
  google_wallet_enabled?: boolean;
  google_wallet_design?: GoogleWalletDesign;
  updated_at: string;
}

export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_events: number;
  open_events: number;
  total_attendance: number;
  overall_attendance_pct: number;
}
