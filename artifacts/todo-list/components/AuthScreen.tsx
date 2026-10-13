import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { getSupabaseClient } from '@/lib/supabase';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AuthMode = 'sign-in' | 'sign-up';

export function AuthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const webInsets =
    Platform.OS === 'web'
      ? { paddingTop: 67, paddingBottom: 34 }
      : { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom };

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !password) {
      setError('Enter a valid email address and password.');
      return;
    }

    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const supabase = getSupabaseClient();
      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage('Check your inbox to confirm your email, then sign in.');
          setMode('sign-in');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not connect to Supabase. Try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
  }

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: webInsets.paddingTop },
      ]}
    >
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(webInsets.paddingBottom, 28) },
        ]}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Text
            style={[styles.brandCheck, { color: colors.primaryForeground }]}
            accessibilityElementsHidden
          >
            ✓
          </Text>
        </View>
        <Text style={[styles.kicker, { color: colors.primary }]}>
          A LITTLE LIST
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Your list,{'\n'}wherever you are.
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Sign in to keep your tasks synced with your Supabase account.
        </Text>

        <View
          style={[
            styles.form,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.foreground }]}>
            {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
          </Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            EMAIL
          </Text>
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            testID="auth-email"
          />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            PASSWORD
          </Text>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            placeholder="Enter your password"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            secureTextEntry
            textContentType={
              mode === 'sign-in' ? 'password' : 'newPassword'
            }
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                color: colors.foreground,
              },
            ]}
            testID="auth-password"
          />

          {error ? (
            <View
              style={[
                styles.feedback,
                { backgroundColor: `${colors.destructive}12` },
              ]}
            >
              <Text style={[styles.feedbackText, { color: colors.destructive }]}>
                {error}
              </Text>
            </View>
          ) : null}
          {message ? (
            <View
              style={[
                styles.feedback,
                { backgroundColor: `${colors.primary}12` },
              ]}
            >
              <Text style={[styles.feedbackText, { color: colors.primary }]}>
                {message}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => void submit()}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: colors.primary,
                opacity: isSubmitting ? 0.7 : pressed ? 0.85 : 1,
              },
            ]}
            testID="auth-submit"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={[
                  styles.submitText,
                  { color: colors.primaryForeground },
                ]}
              >
                {mode === 'sign-in' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.switchRow}>
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
            {mode === 'sign-in' ? 'New to the list?' : 'Already have an account?'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <Text style={[styles.switchAction, { color: colors.primary }]}>
              {mode === 'sign-in' ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingTop: 32,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  brandCheck: {
    fontFamily: 'Inter_700Bold',
    fontSize: 23,
    lineHeight: 27,
  },
  kicker: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.1,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    marginBottom: 25,
    maxWidth: 340,
  },
  form: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  formTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 19,
    marginBottom: 19,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.9,
    marginBottom: 7,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginBottom: 16,
  },
  feedback: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 13,
  },
  feedbackText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  submitText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 19,
    marginBottom: 8,
  },
  switchText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  switchAction: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
});
