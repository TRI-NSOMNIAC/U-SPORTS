import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../providers/auth_provider.dart';
import '../screens/athlete/athlete_dashboard_screen.dart';
import '../screens/athlete/athlete_own_profile_screen.dart';
import '../screens/auth_screen.dart';
import '../screens/bracket_screen.dart';
import '../screens/event_detail_screen.dart';
import '../screens/events_screen.dart';
import '../screens/home_screen.dart';
import '../screens/leaderboard_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/athlete_profile_screen.dart';
import '../screens/student/student_profile_screen.dart';
import '../screens/student/student_register_screen.dart';
import '../screens/student/tryout_registry_screen.dart';

bool _isGuestAllowedPath(String path) {
  if (path == '/' || path == '/auth/login' || path == '/auth/register') return true;
  if (path.startsWith('/leaderboards')) return true;
  if (path.startsWith('/events')) return true;
  if (path.startsWith('/athletes')) return true;
  if (path == '/settings') return true;
  return false;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ref.watch(authRefreshNotifierProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) async {
      final path = state.uri.path;
      final user = Supabase.instance.client.auth.currentUser;

      if (user == null) {
        if (_isGuestAllowedPath(path)) return null;
        return '/auth/login';
      }

      final profile = await ref.read(profileProvider.future);
      final role = profile?.role ?? 'guest';

      if (path == '/settings') {
        if (role == 'student') return '/student/settings';
        if (role == 'athlete') return '/athlete/settings';
        return null;
      }

      if (role == 'organizer' || role == 'super_admin') {
        await Supabase.instance.client.auth.signOut();
        return '/auth/login';
      }

      if (path.startsWith('/notifications')) {
        if (role != 'student' && role != 'athlete') return '/';
        return null;
      }

      if (path.startsWith('/student')) {
        if (role != 'student') return '/';
        if (path.startsWith('/student/tryouts') && profile?.enrollmentVerified != true) {
          return '/student/profile';
        }
        return null;
      }

      if (path.startsWith('/athlete/')) {
        if (role != 'athlete') return '/';
        return null;
      }

      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (ctx, _) => const HomeScreen()),
      GoRoute(path: '/leaderboards', builder: (ctx, _) => const LeaderboardScreen()),
      GoRoute(path: '/events', builder: (ctx, _) => const EventsScreen()),
      GoRoute(
        path: '/events/:id',
        builder: (ctx, st) => EventDetailScreen(
          eventId: st.pathParameters['id']!,
          initialTab: st.uri.queryParameters['tab'] == 'matches' ? 1 : 0,
        ),
      ),
      GoRoute(
        path: '/events/:id/bracket',
        builder: (ctx, st) => BracketScreen(eventId: st.pathParameters['id']!),
      ),
      GoRoute(
        path: '/athletes/:id',
        builder: (ctx, st) => AthleteProfileScreen(athleteId: st.pathParameters['id']!),
      ),
      GoRoute(path: '/notifications', builder: (ctx, _) => const NotificationsScreen()),
      GoRoute(path: '/auth/login', builder: (ctx, _) => const AuthScreen()),
      GoRoute(path: '/auth/register', builder: (ctx, _) => const StudentRegisterScreen()),
      GoRoute(
        path: '/settings',
        builder: (ctx, _) => const SettingsScreen(shell: SettingsShell.guest),
      ),
      GoRoute(path: '/student/profile', builder: (ctx, _) => const StudentProfileScreen()),
      GoRoute(path: '/student/tryouts', builder: (ctx, _) => const TryoutRegistryScreen()),
      GoRoute(
        path: '/student/settings',
        builder: (ctx, _) => const SettingsScreen(shell: SettingsShell.student),
      ),
      GoRoute(path: '/athlete/dashboard', builder: (ctx, _) => const AthleteDashboardScreen()),
      GoRoute(path: '/athlete/profile', builder: (ctx, _) => const AthleteOwnProfileScreen()),
      GoRoute(
        path: '/athlete/settings',
        builder: (ctx, _) => const SettingsScreen(shell: SettingsShell.athlete),
      ),
    ],
  );
});
