import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../providers/institution_provider.dart';
import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';
import '../../utils/student_cor_upload.dart';

const _yearLevels = [
  'Grade 11',
  'Grade 12',
  '1st Year',
  '2nd Year',
  '3rd Year',
  '4th Year',
];

bool _validEmailShape(String e) {
  return RegExp(r'^[\w-.]+@([\w-]+\.)+[\w-]{2,}$').hasMatch(e.trim());
}

class StudentRegisterScreen extends ConsumerStatefulWidget {
  const StudentRegisterScreen({super.key});

  @override
  ConsumerState<StudentRegisterScreen> createState() => _StudentRegisterScreenState();
}

class _StudentRegisterScreenState extends ConsumerState<StudentRegisterScreen> {
  int _step = 0;
  final _fullNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _studentIdCtrl = TextEditingController();
  final _deptCtrl = TextEditingController();
  String _yearLevel = '1st Year';
  File? _corFile;
  String? _corLabel;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _fullNameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _studentIdCtrl.dispose();
    _deptCtrl.dispose();
    super.dispose();
  }

  String? _validateAccountStep(String studentDomain) {
    if (_fullNameCtrl.text.trim().length < 2) return 'Enter your full name';
    if (_fullNameCtrl.text.trim().length > 120) return 'Name is too long';
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return 'Email is required';
    if (!_validEmailShape(email)) return 'Enter a valid email';
    final d = studentDomain.trim().toLowerCase();
    if (!email.toLowerCase().endsWith('@$d')) return 'Use your school email @$d';
    final p = _passwordCtrl.text;
    if (p.length < 8) return 'Password must be at least 8 characters';
    if (p.length > 128) return 'Password is too long';
    return null;
  }

  String? _validateProfileStep() {
    if (_studentIdCtrl.text.trim().length < 3) return 'Student ID is required';
    if (_studentIdCtrl.text.trim().length > 32) return 'Student ID is too long';
    if (_deptCtrl.text.trim().length < 2) return 'Department / course is required';
    if (_deptCtrl.text.trim().length > 120) return 'Department is too long';
    return null;
  }

  void _next(String studentDomain) {
    setState(() => _error = null);
    if (_step == 0) {
      final err = _validateAccountStep(studentDomain);
      if (err != null) {
        setState(() => _error = err);
        return;
      }
    } else if (_step == 1) {
      final err = _validateProfileStep();
      if (err != null) {
        setState(() => _error = err);
        return;
      }
    } else if (_step == 2) {
      if (_corFile == null) {
        setState(() => _error = 'Upload your Certificate of Registration (COR) to continue');
        return;
      }
    }
    setState(() => _step = _step + 1);
  }

  void _back() {
    setState(() {
      _error = null;
      if (_step > 0) _step--;
    });
  }

  Future<void> _pickCor() async {
    setState(() => _error = null);
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.single;
    final path = f.path;
    if (path == null) {
      setState(() => _error = 'Could not read the selected file');
      return;
    }
    final file = File(path);
    final len = await file.length();
    if (len > maxCorBytes) {
      setState(() => _error = 'Document must be 5MB or smaller');
      return;
    }
    setState(() {
      _corFile = file;
      _corLabel = f.name;
    });
  }

  Future<void> _submit(String studentDomain) async {
    final errAcc = _validateAccountStep(studentDomain);
    final errProf = _validateProfileStep();
    if (errAcc != null || errProf != null || _corFile == null) {
      setState(() => _error = errAcc ?? errProf ?? 'Upload your COR');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final authRes = await Supabase.instance.client.auth.signUp(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        data: {
          'full_name': _fullNameCtrl.text.trim(),
          'role': 'student',
        },
      );

      if (authRes.user == null) throw Exception('Registration failed');

      if (authRes.session == null) {
        throw Exception(
          'No active session after sign up. Turn off "Confirm email" in Supabase Auth (hosted: Authentication → Providers → Email), '
          'or confirm your email from the inbox, sign in, and upload your COR from Profile.',
        );
      }

      final userId = authRes.user!.id;

      final profileUp = await Supabase.instance.client
          .from('profiles')
          .update({
            'student_id': _studentIdCtrl.text.trim(),
            'year_level': _yearLevel,
            'department': _deptCtrl.text.trim(),
          })
          .eq('id', userId)
          .select('id')
          .maybeSingle();

      if (profileUp == null) {
        throw Exception('Could not update your profile. Try signing in and complete registration from Profile.');
      }

      await uploadEnrollmentCor(userId, _corFile!, fileName: _corLabel);

      if (!mounted) return;
      context.go('/');
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final insAsync = ref.watch(institutionProvider);
    final studentDomain = insAsync.valueOrNull?.studentEmailDomain ?? 'students.nu-dasma.edu.ph';

    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(
        title: const Text('Student sign up'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _step == 0 ? () => context.pop() : _back,
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            insAsync.when(
              data: (ins) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    ins?.name ?? 'U-Sports',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Upload your COR for enrollment verification. Medical documents are only required after you make a team.',
                    style: TextStyle(fontSize: 12, color: AppTheme.textMuted, height: 1.35),
                  ),
                ],
              ),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 20),
            Row(
              children: List.generate(4, (i) {
                final done = _step > i;
                final active = _step == i;
                return Expanded(
                  child: Container(
                    margin: EdgeInsets.only(right: i < 3 ? 6 : 0),
                    height: 4,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(2),
                      color: done || active ? AppTheme.accent : LayoutTokens.borderSubtle(context),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 20),
            Text(
              ['Account', 'Student info', 'COR', 'Review'][_step.clamp(0, 3)],
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            if (_error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AppTheme.danger.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
                ),
                child: Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13)),
              ),
            if (_step == 0) ...[
              TextField(
                controller: _fullNameCtrl,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  labelText: 'Full name',
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  labelText: 'School email',
                  hintText: 'yourname@$studentDomain',
                  prefixIcon: const Icon(Icons.mail_outline),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
            ],
            if (_step == 1) ...[
              TextField(
                controller: _studentIdCtrl,
                decoration: const InputDecoration(
                  labelText: 'Student ID',
                  prefixIcon: Icon(Icons.badge_outlined),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _yearLevel,
                decoration: const InputDecoration(
                  labelText: 'Year level',
                  prefixIcon: Icon(Icons.school_outlined),
                ),
                items: _yearLevels
                    .map((y) => DropdownMenuItem(value: y, child: Text(y)))
                    .toList(),
                onChanged: (v) => setState(() => _yearLevel = v ?? _yearLevel),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _deptCtrl,
                decoration: const InputDecoration(
                  labelText: 'Department / course',
                  prefixIcon: Icon(Icons.apartment_outlined),
                ),
              ),
            ],
            if (_step == 2) ...[
              OutlinedButton.icon(
                onPressed: _pickCor,
                icon: const Icon(Icons.upload_file),
                label: Text(_corLabel ?? 'Choose COR (PDF or image)'),
              ),
              const SizedBox(height: 8),
              const Text('Max 5 MB.', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
            ],
            if (_step == 3) ...[
              _reviewRow('Name', _fullNameCtrl.text.trim()),
              _reviewRow('Email', _emailCtrl.text.trim()),
              _reviewRow('Student ID', _studentIdCtrl.text.trim()),
              _reviewRow('Year level', _yearLevel),
              _reviewRow('Department', _deptCtrl.text.trim()),
              _reviewRow('COR', _corLabel ?? ''),
            ],
            const SizedBox(height: 28),
            if (_step < 3)
              FilledButton(
                onPressed: _loading ? null : () => _next(studentDomain),
                child: const Text('Continue'),
              ),
            if (_step == 3)
              FilledButton(
                onPressed: _loading ? null : () => _submit(studentDomain),
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Create account'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _reviewRow(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(k, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
          ),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        ],
      ),
    );
  }
}
