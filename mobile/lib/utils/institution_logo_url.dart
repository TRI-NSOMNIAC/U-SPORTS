import '../config/env.dart';

/// Turn stored `institution.logo_url` into a loadable absolute URL (web often stores full URL; handle relative paths).
String? resolveInstitutionLogoUrl(String? raw) {
  if (raw == null) return null;
  final t = raw.trim();
  if (t.isEmpty) return null;
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  if (t.startsWith('//')) return 'https:$t';
  final base = Env.supabaseUrl.replaceAll(RegExp(r'/+$'), '');
  if (base.isEmpty) return null;
  if (t.startsWith('/')) return '$base$t';
  return '$base/$t';
}
