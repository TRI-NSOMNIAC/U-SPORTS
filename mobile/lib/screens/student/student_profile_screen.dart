import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:photo_view/photo_view.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import '../../utils/format_helpers.dart';
import '../../utils/student_cor_upload.dart';

class StudentProfileScreen extends ConsumerStatefulWidget {
  const StudentProfileScreen({super.key});

  @override
  ConsumerState<StudentProfileScreen> createState() => _StudentProfileScreenState();
}

class _StudentProfileScreenState extends ConsumerState<StudentProfileScreen> {
  bool _corBusy = false;
  CorDocument? _corDoc;
  bool _corLoading = true;
  String? _corError;
  String? _corBannerKind;
  String? _corBannerText;
  File? _pendingCorFile;
  String? _pendingCorName;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadCor());
  }

  Future<void> _loadCor() async {
    final profile = ref.read(profileProvider).valueOrNull;
    if (profile == null || !profile.isStudent) {
      setState(() {
        _corLoading = false;
        _corDoc = null;
      });
      return;
    }
    setState(() {
      _corLoading = true;
      _corError = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getJson('/students/me/cor-document');
      if (!mounted) return;
      setState(() {
        _corDoc = data == null ? null : CorDocument.fromJson(Map<String, dynamic>.from(data as Map));
        _corLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _corDoc = null;
        _corLoading = false;
        _corError = 'Could not load your COR record. Check that the API server is running.';
      });
    }
  }

  Future<void> _pickCorFile() async {
    final source = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photo library'),
              onTap: () => Navigator.pop(ctx, 'gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: const Text('PDF or file'),
              onTap: () => Navigator.pop(ctx, 'file'),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    if (source == 'gallery') {
      final picker = ImagePicker();
      final x = await picker.pickImage(source: ImageSource.gallery, maxWidth: 2400, imageQuality: 88);
      if (x == null) return;
      setState(() {
        _pendingCorFile = File(x.path);
        _pendingCorName = x.name;
      });
      _showCorConfirmDialog();
      return;
    }

    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (result == null || result.files.single.path == null) return;
    setState(() {
      _pendingCorFile = File(result.files.single.path!);
      _pendingCorName = result.files.single.name;
    });
    _showCorConfirmDialog();
  }

  void _showCorConfirmDialog() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_corDoc?.fileUrl.isNotEmpty == true ? 'Replace Certificate of Registration?' : 'Upload Certificate of Registration?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _corDoc?.fileUrl.isNotEmpty == true
                  ? 'This replaces your current COR on file. Organizers review the latest upload when your enrollment is unverified.'
                  : 'Your file will be stored as your enrollment COR. PDF or image, max 5MB.',
              style: const TextStyle(fontSize: 14),
            ),
            if (_pendingCorName != null) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: LayoutTokens.cardBackground(context),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: LayoutTokens.borderSubtle(context)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Selected file', style: TextStyle(fontSize: 11, color: LayoutTokens.mutedText(context))),
                    Text(_pendingCorName!, style: const TextStyle(fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: _corBusy
                ? null
                : () {
                    Navigator.pop(ctx);
                    setState(() {
                      _pendingCorFile = null;
                      _pendingCorName = null;
                    });
                  },
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: _corBusy || _pendingCorFile == null ? null : () => _confirmCorUpload(ctx),
            child: Text(_corBusy ? 'Uploading…' : 'Confirm upload'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmCorUpload(BuildContext dialogCtx) async {
    final profile = ref.read(profileProvider).valueOrNull;
    final file = _pendingCorFile;
    if (profile == null || file == null) return;
    setState(() => _corBusy = true);
    final wasRevoked = profile.enrollmentRevokedByOrganizer;
    try {
      final saved = await uploadEnrollmentCor(profile.id, file, fileName: _pendingCorName);
      ref.invalidate(profileProvider);
      if (!mounted) return;
      if (dialogCtx.mounted) Navigator.pop(dialogCtx);
      setState(() {
        _corDoc = saved;
        _pendingCorFile = null;
        _pendingCorName = null;
        _corBannerKind = 'success';
        _corBannerText = wasRevoked
            ? 'New COR uploaded. Your school enrollment will stay unverified until an organizer reviews and approves it again.'
            : 'COR uploaded. An organizer will review it before you can register for tryouts.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _corBannerKind = 'danger';
        _corBannerText = e.toString();
      });
    } finally {
      if (mounted) setState(() => _corBusy = false);
    }
  }

  Future<void> _previewCor(String url) async {
    final lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
      return;
    }
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Certificate of Registration')),
          body: PhotoView(
            imageProvider: NetworkImage(url),
            minScale: PhotoViewComputedScale.contained,
            maxScale: PhotoViewComputedScale.covered * 2,
          ),
        ),
      ),
    );
  }

  String _displayOrNotProvided(String? value) {
    final t = value?.trim();
    return t != null && t.isNotEmpty ? t : 'Not provided';
  }

  @override
  Widget build(BuildContext context) {
    final profAsync = ref.watch(profileProvider);

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
              context.go('/');
            }
          },
        ),
      ),
      body: profAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (profile) {
          if (profile == null) {
            return const Center(child: Text('Not signed in'));
          }
          final verified = profile.enrollmentVerified;
          final unverified = profile.enrollmentUnverified;
          final revoked = profile.enrollmentRevokedByOrganizer;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('My profile', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              Text(
                'School enrollment and your uploaded Certificate of Registration.',
                style: TextStyle(fontSize: 13, color: LayoutTokens.secondaryText(context)),
              ),
              const SizedBox(height: 16),
              _sectionCard(
                title: 'Status',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (verified)
                      _statusRow('Enrollment', 'Verified', AppTheme.success)
                    else if (unverified) ...[
                      _statusRow('Enrollment', 'Unverified', AppTheme.warning),
                      const SizedBox(height: 8),
                      Text(
                        revoked
                            ? 'An organizer reset your school enrollment. Upload a fresh COR below so they can verify you again.'
                            : 'Upload your COR below if you have not yet. An organizer will verify it before you can register for tryouts.',
                        style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                      ),
                    ] else ...[
                      Text(formatEnumLabel(profile.enrollmentStatus ?? 'Pending'), style: const TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      Text(
                        'Your enrollment status will update after organizers process your account.',
                        style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _sectionCard(
                title: 'Information you submitted',
                child: Column(
                  children: [
                    _infoRow(Icons.person_outline, profile.fullName ?? '—'),
                    _infoRow(Icons.mail_outline, profile.email ?? '—'),
                    _labeledInfo('Student ID', _displayOrNotProvided(profile.studentId)),
                    _labeledInfo('Year level', _displayOrNotProvided(profile.yearLevel)),
                    _labeledInfo('Course', _displayOrNotProvided(profile.department)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _sectionCard(
                title: verified ? 'Application status' : 'Pending application',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_corError != null)
                      _banner(_corError!, AlertTone.danger, () => setState(() => _corError = null)),
                    if (_corBannerText != null && _corBannerKind != null)
                      _banner(
                        _corBannerText!,
                        _corBannerKind == 'danger' ? AlertTone.danger : AlertTone.success,
                        () => setState(() {
                          _corBannerText = null;
                          _corBannerKind = null;
                        }),
                      ),
                    if (_corLoading)
                      const LinearProgressIndicator(minHeight: 2)
                    else ...[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.description_outlined, color: AppTheme.accent, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Certificate of Registration (COR)', style: TextStyle(fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                Text(
                                  verified
                                      ? 'Approved — your enrollment COR is on file.'
                                      : revoked
                                          ? 'Renew your uploaded file so an organizer can verify your enrollment again.'
                                          : _corDoc?.fileUrl.isNotEmpty == true
                                              ? 'Waiting for an organizer to review your upload.'
                                              : 'No COR on file yet — upload a PDF or image (max 5MB).',
                                  style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                                ),
                              ],
                            ),
                          ),
                          if (_corDoc?.fileUrl.isNotEmpty == true)
                            TextButton(onPressed: () => _previewCor(_corDoc!.fileUrl), child: const Text('View COR')),
                        ],
                      ),
                      if (unverified && _corError == null) ...[
                        if (revoked)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(
                              'Your enrollment was reset by an organizer. Upload a new Certificate of Registration so they can approve your school account again.',
                              style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                            ),
                          )
                        else if (_corDoc?.fileUrl.isNotEmpty != true)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(
                              'Upload your COR here if sign-up did not finish the document step, or if you still need to submit one. PDF or image, max 5MB.',
                              style: TextStyle(fontSize: 12, color: LayoutTokens.secondaryText(context)),
                            ),
                          ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: _corBusy ? null : _pickCorFile,
                          icon: _corBusy
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.upload_file),
                          label: Text(_corDoc?.fileUrl.isNotEmpty == true ? 'Choose file to replace COR…' : 'Upload COR (PDF or image)…'),
                        ),
                      ],
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.how_to_reg),
                title: const Text('Tryout registry'),
                subtitle: const Text('Browse open tryouts and your registrations'),
                onTap: verified ? () => context.push('/student/tryouts') : null,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionCard({required String title, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: LayoutTokens.borderSubtle(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: LayoutTokens.mutedText(context))),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _statusRow(String label, String value, Color color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 14)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
          child: Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ),
      ],
    );
  }

  Widget _infoRow(IconData icon, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: LayoutTokens.mutedText(context)),
          const SizedBox(width: 10),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }

  Widget _labeledInfo(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.tag, size: 18, color: LayoutTokens.mutedText(context)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label.toUpperCase(), style: TextStyle(fontSize: 10, letterSpacing: 0.6, color: LayoutTokens.mutedText(context))),
                Text(value, style: const TextStyle(fontSize: 14)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _banner(String text, AlertTone tone, VoidCallback onDismiss) {
    final color = tone == AlertTone.danger ? AppTheme.danger : AppTheme.success;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
          IconButton(icon: const Icon(Icons.close, size: 18), onPressed: onDismiss),
        ],
      ),
    );
  }
}

enum AlertTone { danger, success }
