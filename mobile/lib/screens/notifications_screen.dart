import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/tryouts_api_provider.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';
import '../widgets/student_tryouts_notifications_section.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final GlobalKey<StudentTryoutsNotificationsSectionState> _tryoutsKey =
      GlobalKey<StudentTryoutsNotificationsSectionState>();

  @override
  Widget build(BuildContext context) {
    final listAsync = ref.watch(notificationsListProvider);
    final profile = ref.watch(profileProvider);
    final isStudent = profile.valueOrNull?.isStudent ?? false;
    final verifiedStudent = isStudent && (profile.valueOrNull?.enrollmentVerified ?? false);
    final badgeCount = ref.watch(studentNotificationBadgeCountProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (profile.valueOrNull != null)
            TextButton(
              onPressed: () async {
                final p = profile.valueOrNull!;
                await markAllNotificationsRead(p.id);
                ref.invalidate(notificationsListProvider);
                ref.invalidate(unreadNotificationsCountProvider);
              },
              child: const Text('Read all'),
            ),
        ],
      ),
      body: listAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('$e', style: TextStyle(color: scheme.error)),
        ),
        data: (rows) {
          final children = <Widget>[
            if (verifiedStudent)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Material(
                  color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(14),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    child: Row(
                      children: [
                        Badge(
                          isLabelVisible: badgeCount > 0,
                          backgroundColor: const Color(0xFFE53935),
                          textColor: Colors.white,
                          label: Text(
                            badgeCount > 99 ? '99+' : '$badgeCount',
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 11,
                              color: Colors.white,
                            ),
                          ),
                          child: Icon(
                            Icons.notifications_rounded,
                            size: 40,
                            color: scheme.primary,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                badgeCount > 0 ? 'You have updates to review' : 'Notifications',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 16,
                                  color: scheme.onSurface,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                badgeCount > 0
                                    ? 'Tryouts and organizer messages are below.'
                                    : 'Open tryouts and verification messages appear in the next section.',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: scheme.onSurfaceVariant,
                                  height: 1.25,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (isStudent) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: StudentTryoutsNotificationsSection(key: _tryoutsKey),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                child: Text(
                  'Organizer alerts',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ];

          if (rows.isEmpty) {
            children.add(
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: Center(
                  child: Text(
                    isStudent
                        ? 'No messages from organizers yet. Tryout updates stay in the section above.'
                        : 'No notifications yet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: LayoutTokens.secondaryText(context)),
                  ),
                ),
              ),
            );
          } else {
            for (var i = 0; i < rows.length; i++) {
              if (i > 0) {
                children.add(const Divider(height: 1));
              }
              final r = rows[i];
              final read = r['read'] == true;
              final id = r['id'] as String;
              children.add(
                ListTile(
                  tileColor: read ? null : scheme.primary.withValues(alpha: 0.08),
                  title: Text(
                    r['title'] as String? ?? 'Notice',
                    style: TextStyle(
                      fontWeight: read ? FontWeight.w500 : FontWeight.w800,
                      color: scheme.onSurface,
                    ),
                  ),
                  subtitle: Text(
                    '${r['body'] ?? ''}\n${formatDateTime(r['created_at'] as String?)}',
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  onTap: () async {
                    await markNotificationRead(id);
                    ref.invalidate(notificationsListProvider);
                    ref.invalidate(unreadNotificationsCountProvider);
                  },
                ),
              );
            }
          }

          children.add(const SizedBox(height: 24));

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(notificationsListProvider);
              ref.invalidate(unreadNotificationsCountProvider);
              ref.invalidate(openTryoutEventsProvider);
              ref.invalidate(myTryoutRegistrationsProvider);
              ref.invalidate(profileProvider);
              await _tryoutsKey.currentState?.reloadBanners();
            },
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              children: children,
            ),
          );
        },
      ),
    );
  }
}
