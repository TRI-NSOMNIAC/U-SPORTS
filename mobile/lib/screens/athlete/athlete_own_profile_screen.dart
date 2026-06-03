import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:photo_view/photo_view.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/auth_provider.dart';
import '../../theme/app_theme.dart';
import '../../utils/event_placements.dart';
import '../../utils/format_helpers.dart';
import '../../utils/sport_helpers.dart';

class AthleteOwnProfileScreen extends ConsumerStatefulWidget {
  const AthleteOwnProfileScreen({super.key});

  @override
  ConsumerState<AthleteOwnProfileScreen> createState() => _AthleteOwnProfileScreenState();
}

class _AthleteOwnProfileScreenState extends ConsumerState<AthleteOwnProfileScreen> {
  bool _busy = false;

  Future<void> _uploadMedical(String profileId, String athleteId) async {
    final picker = ImagePicker();
    final x = await picker.pickImage(source: ImageSource.gallery, maxWidth: 2400, imageQuality: 88);
    if (x == null) return;
    final file = File(x.path);
    if (await file.length() > 5 * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Max file size is 5MB.')));
      }
      return;
    }
    setState(() => _busy = true);
    try {
      final ext = x.path.contains('.') ? x.path.split('.').last : 'jpg';
      final storagePath = '$profileId/medical_cert.$ext';
      await Supabase.instance.client.storage
          .from('verification-documents')
          .upload(storagePath, file, fileOptions: const FileOptions(upsert: true));
      final url =
          Supabase.instance.client.storage.from('verification-documents').getPublicUrl(storagePath);
      final now = DateTime.now().toUtc().toIso8601String();
      final existing = await Supabase.instance.client
          .from('verification_documents')
          .select('id')
          .eq('athlete_id', athleteId)
          .eq('document_type', 'medical_cert')
          .limit(1)
          .maybeSingle();
      if (existing != null) {
        await Supabase.instance.client.from('verification_documents').delete().eq('id', existing['id'] as String);
      }
      await Supabase.instance.client.from('verification_documents').insert({
        'athlete_id': athleteId,
        'document_type': 'medical_cert',
        'file_url': url,
        'uploaded_at': now,
      });
      ref.invalidate(athleteRowProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Medical certificate saved.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _preview(String url) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Document')),
          body: PhotoView(
            imageProvider: NetworkImage(url),
            minScale: PhotoViewComputedScale.contained,
            maxScale: PhotoViewComputedScale.covered * 2,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(profileProvider);
    final athleteAsync = ref.watch(athleteRowProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('My profile'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/athlete/dashboard');
            }
          },
        ),
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (profile) {
          return athleteAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
            data: (athlete) {
              if (profile == null || athlete == null) {
                return const Center(child: Text('Unable to load athlete record.'));
              }

              return FutureBuilder<Map<String, dynamic>>(
                future: _loadExtras(profile.id, athlete.id),
                builder: (context, snap) {
                  final medical = snap.data?['medical'] as Map<String, dynamic>?;
                  final cor = snap.data?['cor'] as Map<String, dynamic>?;
                  final teams = snap.data?['teams'] as List<dynamic>? ?? [];
                  final finishes = snap.data?['finishes'] as List<dynamic>? ?? [];

                  return ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 40,
                            backgroundColor: AppTheme.schoolPrimary,
                            backgroundImage: profile.avatarUrl != null && profile.avatarUrl!.isNotEmpty
                                ? CachedNetworkImageProvider(profile.avatarUrl!)
                                : null,
                            child: profile.avatarUrl == null || profile.avatarUrl!.isEmpty
                                ? Text(
                                    (profile.fullName ?? '?')[0].toUpperCase(),
                                    style: TextStyle(
                                        fontSize: 32, color: AppTheme.schoolSecondary, fontWeight: FontWeight.w900),
                                  )
                                : null,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(profile.fullName ?? 'Athlete',
                                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                                Text('${sportEmoji(athlete.sport)} ${sportLabel(athlete.sport)}',
                                    style: const TextStyle(color: AppTheme.textSecondary)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        children: [
                          Chip(label: Text('Verification: ${formatEnumLabel(athlete.verificationStatus ?? 'pending')}')),
                          Chip(
                              label: Text(
                                  athlete.medicalCleared == true ? 'Medical cleared' : 'Medical pending')),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Text('Teams', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 6),
                      if (teams.isEmpty)
                        const Text('No team assignments yet.', style: TextStyle(color: AppTheme.textMuted))
                      else
                        ...teams.map((t) => ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text((t as Map)['name'] as String? ?? 'Team'),
                              subtitle: Text((t)['sport'] as String? ?? ''),
                            )),
                      const SizedBox(height: 16),
                      const Text('Competition finishes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      if (finishes.isEmpty)
                        const Text('No completed finishes on record.', style: TextStyle(color: AppTheme.textMuted))
                      else
                        ...finishes.map((f) {
                          final m = f as Map<String, dynamic>;
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(m['eventName'] as String? ?? ''),
                            subtitle: Text('${placementRankLabel(m['rank'] as int)} · ${sportLabel(m['sport'] as String? ?? '')}'),
                            onTap: () => context.push('/events/${m['eventId']}'),
                          );
                        }),
                      const Divider(height: 32),
                      const Text('Medical certificate', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      if (medical != null)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('Uploaded ${formatDateTime(medical['uploaded_at'] as String?)}'),
                          trailing: TextButton(onPressed: () => _preview(medical['file_url'] as String), child: const Text('View')),
                        ),
                      FilledButton.icon(
                        onPressed: _busy ? null : () => _uploadMedical(profile.id, athlete.id),
                        icon: _busy
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.upload_file),
                        label: Text(medical == null ? 'Upload medical' : 'Replace medical'),
                      ),
                      const Divider(height: 32),
                      const Text('School enrollment (COR)', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      if (cor != null)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text('On file · ${formatDateTime(cor['uploaded_at'] as String?)}'),
                          trailing: TextButton(onPressed: () => _preview(cor['file_url'] as String), child: const Text('View')),
                        )
                      else
                        const Text('No COR on this athlete profile.', style: TextStyle(color: AppTheme.textMuted)),
                    ],
                  );
                },
              );
            },
          );
        },
      ),
    );
  }

  Future<Map<String, dynamic>> _loadExtras(String profileId, String athleteId) async {
    final medical = await Supabase.instance.client
        .from('verification_documents')
        .select('file_url, uploaded_at')
        .eq('athlete_id', athleteId)
        .eq('document_type', 'medical_cert')
        .order('uploaded_at', ascending: false)
        .limit(1)
        .maybeSingle();
    final cor = await Supabase.instance.client
        .from('student_documents')
        .select('file_url, uploaded_at')
        .eq('profile_id', profileId)
        .eq('document_type', 'cor')
        .order('uploaded_at', ascending: false)
        .limit(1)
        .maybeSingle();

    final tm = await Supabase.instance.client.from('team_members').select('team_id').eq('athlete_id', athleteId);
    final teamIds = [...(tm as List).map((e) => (e as Map)['team_id'] as String)];
    List<Map<String, dynamic>> teams = [];
    if (teamIds.isNotEmpty) {
      final tr = await Supabase.instance.client.from('teams').select('id,name,sport').inFilter('id', teamIds);
      teams = (tr as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }

    final finishes = <Map<String, dynamic>>[];
    if (teamIds.isNotEmpty) {
      final eps = await Supabase.instance.client.from('event_participants').select('event_id, participant_id').inFilter('participant_id', teamIds);
      final evIds = <dynamic>{...(eps as List).map((e) => (e as Map)['event_id'] as String)}.toList();
      if (evIds.isNotEmpty) {
        final evs = await Supabase.instance.client
            .from('events')
            .select('id,name,sport')
            .inFilter('id', evIds)
            .eq('status', 'completed')
            .eq('is_tryout', false);
        for (final ev in evs as List) {
          final m = Map<String, dynamic>.from(ev as Map);
          final eid = m['id'] as String;
          final myParts = (eps as List)
              .where((e) => (e as Map)['event_id'] == eid)
              .map((e) => (e as Map)['participant_id'] as String)
              .toSet();
          final br = await Supabase.instance.client
              .from('brackets')
              .select('round,match_order,participant_a_id,participant_b_id,winner_id,is_bye,bracket_type')
              .eq('event_id', eid);
          final podium = deriveEliminationPodium((br as List).map((x) => Map<String, dynamic>.from(x as Map)).toList());
          if (podium == null) continue;
          final mine = podium.where((p) => myParts.contains(p.participantId)).toList();
          if (mine.isEmpty) continue;
          finishes.add({
            'eventId': eid,
            'eventName': m['name'],
            'sport': m['sport'],
            'rank': mine.first.rank,
          });
        }
      }
    }

    return {
      'medical': medical == null ? null : Map<String, dynamic>.from(medical as Map),
      'cor': cor == null ? null : Map<String, dynamic>.from(cor as Map),
      'teams': teams,
      'finishes': finishes,
    };
  }
}
