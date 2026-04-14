import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../screens/home_screen.dart';
import '../screens/leaderboard_screen.dart';
import '../screens/events_screen.dart';
import '../screens/event_detail_screen.dart';
import '../screens/athlete_profile_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/auth_screen.dart';
import '../screens/bracket_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final supabase = Supabase.instance.client;

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final user = supabase.auth.currentUser;
      final isAuthRoute = state.uri.path.startsWith('/auth');

      if (user == null && !isAuthRoute) {
        return '/auth/login';
      }

      // Block organizer/admin from mobile
      // (enforced server-side; here for UX only)
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (ctx, _) => const HomeScreen()),
      GoRoute(path: '/leaderboards', builder: (ctx, _) => const LeaderboardScreen()),
      GoRoute(path: '/events', builder: (ctx, _) => const EventsScreen()),
      GoRoute(
        path: '/events/:id',
        builder: (ctx, state) => EventDetailScreen(eventId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/events/:id/bracket',
        builder: (ctx, state) => BracketScreen(eventId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/athletes/:id',
        builder: (ctx, state) => AthleteProfileScreen(athleteId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/notifications', builder: (ctx, _) => const NotificationsScreen()),
      GoRoute(path: '/auth/login', builder: (ctx, _) => const AuthScreen()),
    ],
  );
});
