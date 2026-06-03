import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../providers/announcements_provider.dart';
import '../providers/hub_champions_provider.dart';
import '../providers/hub_live_provider.dart';
import '../providers/hub_recent_events_provider.dart';
import '../providers/institution_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/tryouts_api_provider.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/event_placements.dart';
import '../utils/sport_helpers.dart';
import '../widgets/announcement_banner.dart';
import '../widgets/event_card.dart';
import '../widgets/hub_live_match_sheet.dart';
import '../widgets/institution_brand.dart';
import '../widgets/live_match_card.dart';
import '../widgets/notification_bell_icon_button.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _bottomIndexForPath(String role, String location) {
    if (location.startsWith('/leaderboards')) return 1;
    if (location.startsWith('/events')) return 2;
    if (location.startsWith('/student/profile') ||
        location.startsWith('/athlete/profile') ||
        location.startsWith('/athlete/dashboard') ||
        location.startsWith('/auth/login')) {
      return 3;
    }
    return 0;
  }

  void _onBottomTap(BuildContext context, WidgetRef ref, int i, String role) {
    switch (i) {
      case 0:
        context.go('/');
        break;
      case 1:
        context.go('/leaderboards');
        break;
      case 2:
        context.go('/events');
        break;
      case 3:
        if (role == 'student') {
          context.go('/student/profile');
        } else if (role == 'athlete') {
          context.go('/athlete/profile');
        } else {
          context.go('/auth/login');
        }
        break;
    }
  }

  Widget _heroSection(InstitutionData? ins) {
    if (ins == null) return const SizedBox.shrink();
    final abbr = ins.abbreviation;
    final name = ins.name;
    final tagline = ins.tagline;
    final logoUrl = ins.logoUrl;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.schoolPrimary, AppTheme.schoolPrimary.withValues(alpha: 0.75)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          if (logoUrl != null && logoUrl.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: CachedNetworkImage(imageUrl: logoUrl.trim(), height: 48, width: 48, fit: BoxFit.contain),
              ),
            ),
          Text(
            'LIVE SPORTS PLATFORM',
            style: TextStyle(
              color: AppTheme.schoolSecondary,
              fontWeight: FontWeight.w800,
              fontSize: 11,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            (abbr?.isNotEmpty == true ? abbr! : 'U-Sports').toUpperCase(),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 1),
          ),
          const SizedBox(height: 6),
          Text(name, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 16)),
          if (tagline != null && tagline.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(tagline, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white38, fontStyle: FontStyle.italic)),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final institutionAsync = ref.watch(institutionProvider);
    final announcementsAsync = ref.watch(announcementsHubProvider);
    final liveAsync = ref.watch(hubLiveProvider);
    final recentAsync = ref.watch(hubRecentEventsProvider);
    final championsAsync = ref.watch(hubChampionsProvider);
    final profileAsync = ref.watch(profileProvider);
    final role = profileAsync.valueOrNull?.role ?? 'guest';
    final profile = profileAsync.valueOrNull;
    final isStudent = profile?.isStudent ?? false;

    final loc = GoRouterState.of(context).uri.path;
    final bottomIndex = _bottomIndexForPath(role, loc);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const InstitutionBrandTitle(compact: true),
        actions: [
          if (role == 'guest')
            IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/settings')),
          if (role == 'student' || role == 'athlete')
            profile != null &&
                    ((profile.isStudent && profile.enrollmentVerified) || profile.isAthlete)
                ? NotificationBellIconButton(
                    badgeCount: ref.watch(studentNotificationBadgeCountProvider),
                    onPressed: () => context.push('/notifications'),
                  )
                : IconButton(
                    icon: const Icon(Icons.notifications_outlined),
                    onPressed: () => context.push('/notifications'),
                  ),
          if (role == 'student')
            IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/student/settings')),
          if (role == 'athlete')
            IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/athlete/settings')),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(institutionProvider);
          ref.invalidate(announcementsHubProvider);
          ref.invalidate(hubLiveProvider);
          ref.invalidate(hubRecentEventsProvider);
          ref.invalidate(hubChampionsProvider);
          ref.invalidate(profileProvider);
          ref.invalidate(notificationsListProvider);
          ref.invalidate(unreadNotificationsCountProvider);
          ref.invalidate(openTryoutEventsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (isStudent) ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Welcome${profile?.fullName != null ? ', ${profile!.fullName!.split(' ').first}' : ''}',
                      style: TextStyle(fontSize: 14, color: LayoutTokens.secondaryText(context)),
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => context.push('/student/profile'),
                    icon: const Icon(Icons.person_outline, size: 18),
                    label: const Text('My profile'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => context.push('/notifications'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      Icon(Icons.notifications_active_outlined, size: 18, color: Theme.of(context).colorScheme.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Tryouts & enrollment: open Notifications',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: Theme.of(context).colorScheme.primary),
                    ],
                  ),
                ),
              ),
            ],
            if (role == 'athlete')
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Material(
                  color: AppTheme.accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => context.push('/athlete/dashboard'),
                    child: const Padding(
                      padding: EdgeInsets.all(14),
                      child: Row(
                        children: [
                          Icon(Icons.dashboard_customize, color: AppTheme.accent),
                          SizedBox(width: 12),
                          Expanded(child: Text('My dashboard — stats, schedule, roster', style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.accent))),
                          Icon(Icons.chevron_right, color: AppTheme.accent),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            institutionAsync.when(
              data: (ins) => _heroSection(ins),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            announcementsAsync.when(
              data: (list) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  HubAnnouncementTicker(announcements: list),
                  HubAnnouncementStrip(announcements: list),
                ],
              ),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(width: 10, height: 10, decoration: const BoxDecoration(color: AppTheme.danger, shape: BoxShape.circle)),
                const SizedBox(width: 8),
                Text(
                  'Recent champions',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            championsAsync.when(
              data: (spots) {
                if (spots.isEmpty) return const SizedBox.shrink();
                return Column(
                  children: spots.take(4).map((s) {
                    final lines = s.placements.map((p) {
                      final name = s.labels[p.participantId] ?? 'Participant';
                      return '${placementRankLabel(p.rank)}: $name';
                    }).join(' · ');
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Material(
                        color: LayoutTokens.cardBackground(context),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(color: LayoutTokens.borderSubtle(context)),
                        ),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: () => context.push('/events/${s.eventId}'),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                Text(sportEmoji(s.sport), style: const TextStyle(fontSize: 22)),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(s.eventName, style: TextStyle(fontWeight: FontWeight.w700, color: Theme.of(context).colorScheme.onSurface)),
                                      Text(lines, style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context))),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                );
              },
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(width: 10, height: 10, decoration: const BoxDecoration(color: AppTheme.danger, shape: BoxShape.circle)),
                const SizedBox(width: 8),
                Text(
                  'Live now',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            liveAsync.when(
              data: (snap) {
                if (snap.matches.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text('No matches live right now.', style: TextStyle(color: LayoutTokens.mutedText(context))),
                  );
                }
                return Column(
                  children: snap.matches.map((m) {
                    final mid = m['id'] as String;
                    final period = snap.periodByMatch[mid] ?? 1;
                    return LiveMatchCard(
                      match: m,
                      labels: snap.participantLabels,
                      period: period,
                      onWatch: () => showHubLiveMatchSheet(context, matchId: mid),
                    );
                  }).toList(),
                );
              },
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Events',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                const Spacer(),
                TextButton(
                  onPressed: () => context.push('/events'),
                  child: const Text('Upcoming →'),
                ),
                TextButton(
                  onPressed: () => context.push('/events?view=past'),
                  child: const Text('Past results →'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            recentAsync.when(
              data: (evs) {
                if (evs.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'No upcoming or live events to show here right now.',
                      style: TextStyle(color: LayoutTokens.mutedText(context)),
                    ),
                  );
                }
                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.95,
                  ),
                  itemCount: evs.length,
                  itemBuilder: (ctx, i) {
                    final e = evs[i];
                    return EventCard(
                      hubCompact: true,
                      event: e,
                      onTap: () => context.push('/events/${e['id']}'),
                    );
                  },
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: LinearProgressIndicator(minHeight: 2),
              ),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            Text(
              'Browse by Sport',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: _browseSportCard(context, 'basketball')),
                const SizedBox(width: 8),
                Expanded(child: _browseSportCard(context, 'volleyball')),
                const SizedBox(width: 8),
                Expanded(child: _browseSportCard(context, 'table-tennis')),
              ],
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        selectedFontSize: 11,
        unselectedFontSize: 10,
        currentIndex: bottomIndex,
        onTap: (i) => _onBottomTap(context, ref, i, role),
        items: [
          const BottomNavigationBarItem(icon: Icon(Icons.home_outlined), label: 'Home'),
          const BottomNavigationBarItem(icon: Icon(Icons.emoji_events_outlined), label: 'Standings'),
          const BottomNavigationBarItem(icon: Icon(Icons.calendar_today_outlined), label: 'Events'),
          BottomNavigationBarItem(icon: const Icon(Icons.person_outline), label: role == 'guest' ? 'Sign in' : 'Profile'),
        ],
      ),
    );
  }

  Widget _browseSportCard(BuildContext context, String sport) {
    return Material(
      color: LayoutTokens.cardBackground(context),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: LayoutTokens.borderSubtle(context)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/leaderboards?sport=$sport'),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 6),
          child: Column(
            children: [
              Text(sportEmoji(sport), style: const TextStyle(fontSize: 34)),
              const SizedBox(height: 8),
              Text(
                sportLabel(sport),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
