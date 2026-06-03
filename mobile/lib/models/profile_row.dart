class ProfileRow {
  ProfileRow({
    required this.id,
    required this.role,
    this.fullName,
    this.email,
    this.avatarUrl,
    this.enrollmentStatus,
    this.studentId,
    this.yearLevel,
    this.department,
    this.enrollmentVerificationResetAt,
  });

  factory ProfileRow.fromJson(Map<String, dynamic> j) {
    return ProfileRow(
      id: j['id'] as String,
      role: j['role'] as String? ?? 'guest',
      fullName: j['full_name'] as String?,
      email: j['email'] as String?,
      avatarUrl: j['avatar_url'] as String?,
      enrollmentStatus: j['enrollment_status'] as String?,
      studentId: j['student_id'] as String?,
      yearLevel: j['year_level'] as String?,
      department: j['department'] as String?,
      enrollmentVerificationResetAt: j['enrollment_verification_reset_at'] as String?,
    );
  }

  final String id;
  final String role;
  final String? fullName;
  final String? email;
  final String? avatarUrl;
  final String? enrollmentStatus;
  final String? studentId;
  final String? yearLevel;
  final String? department;
  final String? enrollmentVerificationResetAt;

  bool get isStudent => role == 'student';
  bool get isAthlete => role == 'athlete';
  bool get enrollmentVerified => enrollmentStatus == 'verified';
  bool get enrollmentUnverified => enrollmentStatus == 'unverified';
  bool get enrollmentRevokedByOrganizer =>
      enrollmentUnverified && enrollmentVerificationResetAt != null && enrollmentVerificationResetAt!.isNotEmpty;
}

class AthleteRow {
  AthleteRow({
    required this.id,
    required this.profileId,
    required this.sport,
    this.position,
    this.jerseyNumber,
    this.yearLevel,
    this.department,
    this.verificationStatus,
      this.medicalCleared,
      this.medicalClearanceRevokedAt,
  });

  factory AthleteRow.fromJson(Map<String, dynamic> j) {
    return AthleteRow(
      id: j['id'] as String,
      profileId: j['profile_id'] as String,
      sport: j['sport'] as String? ?? '',
      position: j['position'] as String?,
      jerseyNumber: j['jersey_number']?.toString(),
      yearLevel: j['year_level'] as String?,
      department: j['department'] as String?,
      verificationStatus: j['verification_status'] as String?,
      medicalCleared: j['medical_cleared'] as bool?,
      medicalClearanceRevokedAt: j['medical_clearance_revoked_at'] as String?,
    );
  }

  final String id;
  final String profileId;
  final String sport;
  final String? position;
  final String? jerseyNumber;
  final String? yearLevel;
  final String? department;
  final String? verificationStatus;
  final bool? medicalCleared;
  final String? medicalClearanceRevokedAt;
}
