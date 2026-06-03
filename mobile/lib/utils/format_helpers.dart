import 'package:intl/intl.dart';

String formatEnumLabel(String raw) {
  if (raw.isEmpty) return raw;
  return raw
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
}

String eventLifecycleLabel(String status) {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'registration':
      return 'Open for registration';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return formatEnumLabel(status);
  }
}

/// Guest-facing hub / public labels (matches web `eventPublicLifecycleLabel`).
String eventPublicLifecycleLabel(String status) {
  switch (status) {
    case 'draft':
      return 'Preparing';
    case 'registration':
      return 'Upcoming';
    case 'in_progress':
      return 'Ongoing';
    case 'completed':
      return 'Finished';
    case 'cancelled':
      return 'Cancelled';
    default:
      return formatEnumLabel(status);
  }
}

String matchStatusLabel(String status) {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'live':
      return 'Live now';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return formatEnumLabel(status);
  }
}

String tryoutRegistrationLabel(String status) {
  switch (status) {
    case 'registered':
      return 'Registered';
    case 'selected':
      return 'Selected';
    case 'not_selected':
      return 'Not selected';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return formatEnumLabel(status);
  }
}

String formatDateTime(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return '—';
  return DateFormat('MMM d, y · h:mm a').format(d.toLocal());
}

String formatShortDate(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return '—';
  return DateFormat('MMM d').format(d.toLocal());
}

String initialsFromName(String? name) {
  if (name == null || name.trim().isEmpty) return '?';
  final parts = name.trim().split(RegExp(r'\s+'));
  if (parts.length == 1) {
    return parts[0].length >= 2 ? parts[0].substring(0, 2).toUpperCase() : parts[0].toUpperCase();
  }
  return ('${parts[0][0]}${parts[parts.length - 1][0]}').toUpperCase();
}
