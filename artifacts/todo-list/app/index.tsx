import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthScreen } from '@/components/AuthScreen';
import { useColors } from '@/hooks/useColors';
import { getSupabaseClient, getSupabaseConfigError } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Task = {
  id: string;
  title: string;
  completed: boolean;
};

type Filter = 'all' | 'active' | 'done';

const STORAGE_KEY = '@little-list/tasks';
const MIGRATION_KEY = '@little-list/supabase-migration';
const TASK_COLUMNS = 'id,title,completed,created_at';
const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: 'all' },
  { label: 'To do', value: 'active' },
  { label: 'Done', value: 'done' },
];

function isTaskList(value: unknown): value is Task[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item?.id === 'string' &&
        typeof item?.title === 'string' &&
        typeof item?.completed === 'boolean',
    )
  );
}

function taskErrorMessage(error: unknown) {
  const details = error as { code?: string; message?: string };
  if (
    details?.code === 'PGRST205' ||
    details?.message?.includes('public.tasks')
  ) {
    return 'Supabase is connected, but its tasks table is not set up yet. Run artifacts/todo-list/supabase/setup.sql in your Supabase SQL Editor, then tap Retry.';
  }
  return (
    details?.message ||
    'Could not sync with Supabase. Check your connection and try again.'
  );
}

export default function TodoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dataError, setDataError] = useState('');
  const requestId = useRef(0);

  const completedCount = tasks.filter((task) => task.completed).length;
  const activeCount = tasks.length - completedCount;
  const progress = tasks.length === 0 ? 0 : completedCount / tasks.length;
  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === 'active') return !task.completed;
        if (filter === 'done') return task.completed;
        return true;
      }),
    [filter, tasks],
  );

  const loadTasks = useCallback(async (userId: string) => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setDataError('');
    try {
      const supabase = getSupabaseClient();
      const migrationKey = MIGRATION_KEY;
      const { data: remoteTasks, error: initialLoadError } = await supabase
        .from('tasks')
        .select(TASK_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (initialLoadError) throw initialLoadError;

      if ((await AsyncStorage.getItem(migrationKey)) !== 'complete') {
        const savedTasks = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed: unknown = savedTasks ? JSON.parse(savedTasks) : [];
        if (!isTaskList(parsed)) {
          throw new Error('Your saved on-device task list could not be read.');
        }
        if (parsed.length > 0) {
          const { error: migrationError } = await supabase
            .from('tasks')
            .upsert(
              parsed.map((task) => ({
                id: task.id,
                user_id: userId,
                title: task.title,
                completed: task.completed,
              })),
              { onConflict: 'id' },
            );
          if (migrationError) throw migrationError;
          await AsyncStorage.setItem(migrationKey, 'complete');
          const { data: migratedTasks, error: reloadError } = await supabase
            .from('tasks')
            .select(TASK_COLUMNS)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          if (reloadError) throw reloadError;
          if (currentRequest === requestId.current) setTasks(migratedTasks ?? []);
        } else {
          await AsyncStorage.setItem(migrationKey, 'complete');
          if (currentRequest === requestId.current) setTasks(remoteTasks ?? []);
        }
      } else if (currentRequest === requestId.current) {
        setTasks(remoteTasks ?? []);
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setDataError(
          taskErrorMessage(
            error || new Error('Could not sync with Supabase.'),
          ),
        );
      }
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const configError = getSupabaseConfigError();
    if (configError) {
      setDataError(configError);
      setAuthReady(true);
      return;
    }

    let isMounted = true;
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setAuthReady(true);
      setInputError('');
      setDataError('');
      if (nextSession) {
        setIsLoading(true);
        setTimeout(() => {
          if (isMounted) void loadTasks(nextSession.user.id);
        }, 0);
      } else {
        requestId.current += 1;
        setTasks([]);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      requestId.current += 1;
      data.subscription.unsubscribe();
    };
  }, [loadTasks]);

  async function addTask() {
    const title = input.trim();
    if (!title) {
      setInputError('Write a task first.');
      return;
    }

    if (!session) return;

    Keyboard.dismiss();
    setIsSaving(true);
    setDataError('');
    try {
      const { data, error } = await getSupabaseClient()
        .from('tasks')
        .insert({ user_id: session.user.id, title })
        .select(TASK_COLUMNS)
        .single();
      if (error) throw error;
      setTasks((current) => [data, ...current]);
      setInput('');
      setInputError('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      setDataError(
        taskErrorMessage(error || new Error('Could not add the task.')),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleTask(task: Task) {
    if (!session) return;
    setIsSaving(true);
    setDataError('');
    try {
      const { error } = await getSupabaseClient()
        .from('tasks')
        .update({ completed: !task.completed })
        .eq('id', task.id)
        .eq('user_id', session.user.id);
      if (error) throw error;
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, completed: !item.completed } : item,
        ),
      );
      void Haptics.selectionAsync();
    } catch (error) {
      setDataError(
        taskErrorMessage(error || new Error('Could not update the task.')),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTask(id: string) {
    if (!session) return;
    setIsSaving(true);
    setDataError('');
    try {
      const { error } = await getSupabaseClient()
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);
      if (error) throw error;
      setTasks((current) => current.filter((task) => task.id !== id));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      setDataError(
        taskErrorMessage(error || new Error('Could not remove the task.')),
      );
    } finally {
      setIsSaving(false);
    }
  }

  function retryLoad() {
    if (session) void loadTasks(session.user.id);
  }

  async function signOut() {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) setDataError(error.message);
  }

  const dateLabel = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const webInsets =
    Platform.OS === 'web'
      ? { paddingTop: 67, paddingBottom: 34 }
      : { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom };

  if (!authReady) {
    return (
      <View
        style={[
          styles.screen,
          styles.loading,
          { backgroundColor: colors.background, paddingTop: webInsets.paddingTop },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: colors.background, paddingTop: webInsets.paddingTop },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.dateRow}>
            <View style={styles.dateLead}>
              <View style={[styles.dateIcon, { backgroundColor: colors.accent }]}>
                <Feather name="sun" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                {dateLabel.toUpperCase()}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={() => void signOut()}
              hitSlop={10}
              style={({ pressed }) => [
                styles.signOutButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              testID="sign-out"
            >
              <Feather name="log-out" size={17} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[styles.heading, { color: colors.foreground }]}>
            One thing{'\n'}at a time.
          </Text>
          <View style={styles.progressRow}>
            <Text style={[styles.summary, { color: colors.mutedForeground }]}>
              {activeCount === 0
                ? tasks.length > 0
                  ? 'Everything is checked off.'
                  : 'A little progress goes a long way.'
                : `${activeCount} ${activeCount === 1 ? 'task' : 'tasks'} to go`}
            </Text>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: colors.secondary },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.round(progress * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <View style={styles.composer}>
          <View
            style={[
              styles.inputWrap,
              {
                backgroundColor: colors.card,
                borderColor: inputError ? colors.destructive : colors.border,
              },
            ]}
          >
            <Feather name="edit-3" size={17} color={colors.mutedForeground} />
            <TextInput
              accessibilityLabel="New task"
              returnKeyType="done"
              value={input}
              onChangeText={(value) => {
                setInput(value);
                if (inputError) setInputError('');
              }}
              onSubmitEditing={() => void addTask()}
              placeholder="Add a task..."
              placeholderTextColor={colors.mutedForeground}
              maxLength={120}
              style={[styles.input, { color: colors.foreground }]}
              testID="task-input"
              editable={!isSaving}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add task"
              onPress={() => void addTask()}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
              ]}
              testID="add-task"
            >
              <Feather name="plus" size={20} color={colors.primaryForeground} />
            </Pressable>
          </View>
          {inputError ? (
            <Text style={[styles.inlineError, { color: colors.destructive }]}>
              {inputError}
            </Text>
          ) : null}
        </View>

        {dataError ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: colors.accent, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.foreground }]}>
              {dataError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={retryLoad}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.listHeading}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Your list
          </Text>
          <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>
            {tasks.length} {tasks.length === 1 ? 'ITEM' : 'ITEMS'}
          </Text>
        </View>

        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const selected = filter === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(item.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderColor: selected ? colors.primary : colors.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                testID={`filter-${item.value}`}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: selected
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={visibleTasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.taskList,
              visibleTasks.length === 0 && styles.emptyList,
            ]}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            scrollEnabled={visibleTasks.length > 0}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.taskRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.completed }}
                  accessibilityLabel={`${item.completed ? 'Mark as not done' : 'Mark as done'}: ${item.title}`}
                  onPress={() => void toggleTask(item)}
                  disabled={isSaving}
                  style={({ pressed }) => [
                    styles.checkButton,
                    {
                      backgroundColor: item.completed
                        ? colors.primary
                        : 'transparent',
                      borderColor: item.completed
                        ? colors.primary
                        : colors.input,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  testID={`toggle-${item.id}`}
                >
                  {item.completed ? (
                    <Feather
                      name="check"
                      size={14}
                      color={colors.primaryForeground}
                    />
                  ) : null}
                </Pressable>
                <Text
                  style={[
                    styles.taskTitle,
                    {
                      color: item.completed
                        ? colors.mutedForeground
                        : colors.foreground,
                      textDecorationLine: item.completed
                        ? 'line-through'
                        : 'none',
                    },
                  ]}
                >
                  {item.title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title}`}
                  onPress={() => void removeTask(item.id)}
                  disabled={isSaving}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.removeButton,
                    { opacity: pressed ? 0.55 : 1 },
                  ]}
                  testID={`remove-${item.id}`}
                >
                  <Feather
                    name="x"
                    size={17}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View
                  style={[
                    styles.emptyIcon,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Feather
                    name={filter === 'done' ? 'check' : 'feather'}
                    size={21}
                    color={colors.primary}
                  />
                </View>
                <Text
                  style={[styles.emptyTitle, { color: colors.foreground }]}
                >
                  {filter === 'done'
                    ? 'Nothing checked off yet'
                    : filter === 'active'
                      ? 'You’re all caught up'
                      : 'Your list is clear'}
                </Text>
                <Text
                  style={[
                    styles.emptyDescription,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {filter === 'done'
                    ? 'Finished tasks will show up here.'
                    : filter === 'active'
                      ? 'Add a new task whenever you’re ready.'
                      : 'Add one small thing to get started.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
      <View
        style={[
          styles.bottomNote,
          {
            borderTopColor: colors.border,
            paddingBottom: Math.max(webInsets.paddingBottom, 16),
          },
        ]}
      >
        <Feather name="check-circle" size={14} color={colors.primary} />
        <Text style={[styles.bottomText, { color: colors.mutedForeground }]}>
          Small steps add up.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 22,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 9,
    marginBottom: 20,
  },
  dateLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  signOutButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.05,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 39,
    lineHeight: 45,
    letterSpacing: -1.5,
  },
  progressRow: {
    marginTop: 16,
    gap: 10,
  },
  summary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  composer: {
    marginBottom: 24,
  },
  inputWrap: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 7,
    gap: 11,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 52,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineError: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 7,
    marginLeft: 5,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 18,
  },
  errorText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginRight: 12,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  listHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 19,
    letterSpacing: -0.4,
  },
  countLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 13,
  },
  filterChip: {
    minHeight: 34,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 15,
    justifyContent: 'center',
  },
  filterText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskList: {
    paddingBottom: 16,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 9,
  },
  taskRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkButton: {
    width: 23,
    height: 23,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  taskTitle: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  removeButton: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginBottom: 5,
    textAlign: 'center',
  },
  emptyDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomNote: {
    minHeight: 50,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -22,
    paddingTop: 13,
  },
  bottomText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
});
