import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import '../providers/tryouts_api_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/format_helpers.dart';
import '../utils/hub_student_banner.dart';
import '../utils/sport_helpers.dart';
import 'hub_dismissible_alert.dart';

/// Tryout registration + enrollment messaging for students (shown on Notifications, not Home).
class StudentTryoutsNotificationsSection extends ConsumerStatefulWidget {
  const StudentTryoutsNotificationsSection({super.key});

  @override
  ConsumerState<StudentTryoutsNotificationsSection> createState() =>
      StudentTryoutsNotificationsSectionState();
}

class StudentTryoutsNotificationsSectionState extends ConsumerState<StudentTryoutsNotificationsSection> {
  bool _showUnverifiedBanner = false;
  bool _showVerifiedBanner = false;
  String? _tryoutError;
  String? _registeringId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadStudentBanners());
  }

  Future<void> reloadBanners() => _loadStudentBanners();

  Future<void> _loadStudentBanners() async {
    final profile = ref.read(profileProvider).valueOrNull;
    if (profile == null || !profile.isStudent) return;
    final uid = profile.id;
    final verified = profile.enrollmentVerified;
    final unverified = profile.enrollmentUnverified;
    final unDismissed = unverified && !await isHubStudentBannerDismissed(uid, HubStudentBannerKind.unverified);
    final verDismissed = verified && !await isHubStudentBannerDismissed(uid, HubStudentBannerKind.verified);
    if (!mounted) return;
    setState(() {
      _showUnverifiedBanner = unDismissed;
      _showVerifiedBanner = verDismissed;
    });
  }

  Map<String, Map<String, dynamic>> _myTryoutsMap(List<Map<String, dynamic>> regs) {
    final map = <String, Map<String, dynamic>>{};
    for (final r in regs) {
      final eid = r['event_id'] as String?;
      if (eid != null) map[eid] = r;
    }
    return map;
  }

  Map<String, dynamic>? _activeRegistration(Map<String, Map<String, dynamic>> myTryouts) {
    for (final r in myTryouts.values) {
      final st = r['status'] as String? ?? '';
      if (st == 'registered' || st == 'selected') return r;
    }
    return null;
  }

  Future<void> _registerTryout(String eventId) async {
    setState(() {
      _tryoutError = null;
      _registeringId = eventId;
    });
    try {
      final api = ref.read(apiClientProvider);
      await api.postJson('/events/$eventId/tryout/register');
      ref.invalidate(myTryoutRegistrationsProvider);
      ref.invalidate(openTryoutEventsProvider);
      if (mounted) {
        setState(() => _registeringId = null);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Registered for tryout.')));
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _tryoutError = e.toString();
          _registeringId = null;
        });
      }
    }
  }

  void _promptTryoutConfirm(Map<String, dynamic> ev) {
    final sport = ev['sport'] as String? ?? '';
    final season = ev['season'] as Map<String, dynamic>?;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm tryout registration'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Register for ${ev['name']}? This tryout is ${sportLabel(sport)} · ${season?['name'] ?? 'this season'}.',
              style: TextStyle(fontSize: 14, color: Theme.of(ctx).colorScheme.onSurface),
            ),
            const SizedBox(height: 12),
            Text(
              'You can only have one active tryout sign-up per sport each season. If you confirm, your registration will be sent to your organizers.',
              style: TextStyle(fontSize: 14, color: Theme.of(ctx).colorScheme.onSurfaceVariant),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: _registeringId != null ? null : () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: _registeringId != null
                ? null
                : () {
                    Navigator.pop(ctx);
                    _registerTryout(ev['id'] as String);
                  },
            child: const Text('Yes, register'),
          ),
        ],
      ),
    );
  }

  Widget _tryoutCard({
    required bool verified,
    required AsyncValue<List<Map<String, dynamic>>> tryoutsOpen,
    required Map<String, Map<String, dynamic>> myTryouts,
    required Map<String, dynamic>? activeReg,
  }) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final secondary = LayoutTokens.secondaryText(context);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.calendar_today, color: Theme.of(context).colorScheme.primary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Tryout registration',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: onSurface),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (!verified)
            Text(
              'Available after an organizer verifies your school enrollment.',
              style: TextStyle(fontSize: 13, color: secondary),
            )
          else
            tryoutsOpen.when(
              loading: () => const LinearProgressIndicator(minHeight: 2),
              error: (_, __) => Text(
                'Could not load tryouts.',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              data: (events) {
                if (events.isEmpty) {
                  return Text(
                    'No tryouts are open for registration right now.',
                    style: TextStyle(fontSize: 13, color: secondary),
                  );
                }
                return Column(
                  children: events.map((ev) {
                    final id = ev['id'] as String;
                    final sport = ev['sport'] as String? ?? '';
                    final season = ev['season'] as Map<String, dynamic>?;
                    final reg = myTryouts[id];
                    final blocked = reg == null &&
                        activeReg != null &&
                        myTryouts.entries.any((e) => e.key != id && (e.value['status'] == 'registered' || e.value['status'] == 'selected'));
                    final blockingSport = blocked ? sportLabel(activeReg['sport'] as String? ?? '') : null;
                    final status = reg?['status'] as String?;

                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  ev['name'] as String? ?? 'Tryout',
                                  style: TextStyle(fontWeight: FontWeight.w600, color: onSurface),
                                ),
                                Text(
                                  '${sportLabel(sport)} · ${season?['name'] ?? 'Season'}',
                                  style: TextStyle(fontSize: 12, color: secondary),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              if (reg != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: (status == 'selected'
                                            ? AppTheme.success
                                            : status == 'not_selected'
                                                ? Theme.of(context).colorScheme.outline
                                                : Theme.of(context).colorScheme.primary)
                                        .withValues(alpha: 0.18),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    tryoutRegistrationLabel(status ?? ''),
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: status == 'selected'
                                          ? AppTheme.success
                                          : status == 'not_selected'
                                              ? Theme.of(context).colorScheme.onSurfaceVariant
                                              : Theme.of(context).colorScheme.primary,
                                    ),
                                  ),
                                )
                              else if (blocked)
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    const FilledButton(onPressed: null, child: Text('Register')),
                                    if (blockingSport != null)
                                      Text(
                                        'Already in $blockingSport tryout this season',
                                        style: TextStyle(fontSize: 10, color: LayoutTokens.mutedText(context)),
                                      ),
                                  ],
                                )
                              else
                                FilledButton(
                                  onPressed: _registeringId == id ? null : () => _promptTryoutConfirm(ev),
                                  child: _registeringId == id
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        )
                                      : const Text('Register'),
                                ),
                            ],
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(profileProvider).valueOrNull;
    if (profile == null || !profile.isStudent) return const SizedBox.shrink();

    final verified = profile.enrollmentVerified;
    final tryoutsOpen = ref.watch(openTryoutEventsProvider);
    final myRegs = ref.watch(myTryoutRegistrationsProvider);
    final myTryouts = _myTryoutsMap(myRegs.valueOrNull ?? []);
    final activeReg = _activeRegistration(myTryouts);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'Tryouts & enrollment',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        if (_showUnverifiedBanner)
          HubDismissibleAlert(
            tone: AlertTone.warning,
            message: 'Your enrollment is pending organizer review. You can still open Standings and Events from the navigation bar.',
            onDismiss: () async {
              await dismissHubStudentBanner(profile.id, HubStudentBannerKind.unverified);
              if (mounted) setState(() => _showUnverifiedBanner = false);
            },
          ),
        if (_showVerifiedBanner)
          HubDismissibleAlert(
            tone: AlertTone.success,
            message:
                'You are a verified student — register for open tryouts below (one active sign-up per sport per season), or browse events and standings from Home.',
            onDismiss: () async {
              await dismissHubStudentBanner(profile.id, HubStudentBannerKind.verified);
              if (mounted) setState(() => _showVerifiedBanner = false);
            },
          ),
        if (_tryoutError != null)
          HubDismissibleAlert(
            tone: AlertTone.danger,
            message: _tryoutError!,
            onDismiss: () => setState(() => _tryoutError = null),
          ),
        _tryoutCard(
          verified: verified,
          tryoutsOpen: tryoutsOpen,
          myTryouts: myTryouts,
          activeReg: activeReg,
        ),
      ],
    );
  }
}
