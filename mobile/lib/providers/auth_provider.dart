import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/profile_row.dart';
import 'auth_listen.dart';

final authRefreshNotifierProvider = Provider<AuthRefreshNotifier>((ref) {
  final n = AuthRefreshNotifier();
  ref.onDispose(n.dispose);
  return n;
});

final authUserProvider = Provider<User?>((ref) {
  ref.watch(authRefreshNotifierProvider);
  return Supabase.instance.client.auth.currentUser;
});

final profileProvider = FutureProvider<ProfileRow?>((ref) async {
  ref.watch(authRefreshNotifierProvider);
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return null;
  final row = await Supabase.instance.client
      .from('profiles')
      .select()
      .eq('id', user.id)
      .maybeSingle();
  if (row == null) return null;
  return ProfileRow.fromJson(Map<String, dynamic>.from(row as Map));
});

final athleteRowProvider = FutureProvider<AthleteRow?>((ref) async {
  final profile = await ref.watch(profileProvider.future);
  if (profile == null || !profile.isAthlete) return null;
  final row = await Supabase.instance.client
      .from('athletes')
      .select()
      .eq('profile_id', profile.id)
      .maybeSingle();
  if (row == null) return null;
  return AthleteRow.fromJson(Map<String, dynamic>.from(row as Map));
});
