import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
  Image,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassBackground } from '../components/GlassBackground';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ScalePressable } from '../components/ScalePressable';
import { api, ChatMessage } from '../services/api';
import StarField from '../components/StarField';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'typing';
  content: string;
}

const CHAT_HISTORY_LIMIT = 20;

const QUICK_PROMPTS = [
  'Show my biggest categories this month in a table.',
  'Give me a concise weekly spending breakdown.',
  'Find unusual transactions I should verify.',
];

function TypingIndicator() {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700 }),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.typingRow, animatedStyle]}> 
      <View style={styles.typingDot} />
      <View style={styles.typingDot} />
      <View style={styles.typingDot} />
    </Animated.View>
  );
}

function MessageBubble({ item }: { item: DisplayMessage }) {

  if (item.role === 'typing') {
    return (
    <Animated.View 
      entering={FadeInDown.duration(300)}
      style={[styles.messageRow, styles.assistantRow]}
    > 
        <View style={styles.assistantAvatar}>
          <Ionicons name="sparkles" size={13} color="#0D1116" />
        </View>
        <GlassBackground
          style={[styles.bubble, styles.assistantBubble]}
          blurIntensity={82}
          blurTint="systemChromeMaterialDark"
          tintColor={Platform.OS === 'ios' ? 'rgba(10, 10, 12, 0.35)' : undefined}
          fallbackColor="rgba(8, 8, 10, 0.92)"
        >
          <TypingIndicator />
        </GlassBackground>
      </Animated.View>
    );
  }

  const isUser = item.role === 'user';
  return (
    <Animated.View 
      entering={FadeInDown.duration(300)}
      style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}
    > 
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <Image source={require('../../images/osho_chat.png')} style={styles.avatarImage} />
        </View>
      )}

      {isUser ? (
        <GlassBackground
          style={[styles.bubble, styles.userBubble]}
          blurIntensity={82}
          blurTint="systemChromeMaterialDark"
          tintColor={Platform.OS === 'ios' ? 'rgba(248, 113, 113, 0.22)' : undefined}
          fallbackColor="rgba(78, 18, 24, 0.9)"
        >
          <Text style={styles.userText}>{item.content}</Text>
        </GlassBackground>
      ) : (
        <GlassBackground
          style={[styles.bubble, styles.assistantBubble]}
          blurIntensity={82}
          blurTint="systemChromeMaterialDark"
          tintColor={Platform.OS === 'ios' ? 'rgba(10, 10, 12, 0.35)' : undefined}
          fallbackColor="rgba(8, 8, 10, 0.92)"
        >
          <Markdown style={markdownStyles}>{item.content}</Markdown>
        </GlassBackground>
      )}
    </Animated.View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList<DisplayMessage>>(null);
  const msgCounter = useRef(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const quickPrompts = useMemo(() => QUICK_PROMPTS, []);

  const nextId = () => {
    msgCounter.current += 1;
    return `msg_${msgCounter.current}_${Date.now()}`;
  };

  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || sending) return;

    const userMsg: DisplayMessage = {
      id: nextId(),
      role: 'user',
      content: question,
    };

    const typingMsg: DisplayMessage = {
      id: 'typing',
      role: 'typing',
      content: '',
    };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setInput('');
    setSending(true);
    scrollToEnd();

    const requestHistory = [...history];

    try {
      const data = await api.ask(question, requestHistory);
      const assistantMsg: DisplayMessage = {
        id: nextId(),
        role: 'assistant',
        content: data.response,
      };

      setMessages((prev) => prev.filter((m) => m.id !== 'typing').concat(assistantMsg));
      setHistory((prev) => {
        const updated = [
          ...prev,
          { role: 'user' as const, content: question },
          { role: 'assistant' as const, content: data.response },
        ];
        return updated.slice(-CHAT_HISTORY_LIMIT);
      });
    } catch (err: any) {
      const errorMsg: DisplayMessage = {
        id: nextId(),
        role: 'assistant',
        content: `I hit a snag: ${err?.message || 'Something went wrong.'}`,
      };
      setMessages((prev) => prev.filter((m) => m.id !== 'typing').concat(errorMsg));
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const canSend = input.trim().length > 0 && !sending;

  const handleClearChat = () => {
    setMessages([]);
    setHistory([]);
  };

  return (
    <View style={styles.container}>
      <StarField />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}> 
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Swipe</Text>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <View style={styles.headerRight}>
          <ScalePressable onPress={handleClearChat} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={20} color={Colors.textPrimary} />
          </ScalePressable>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble item={item} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.messages,
          messages.length === 0 && styles.emptyMessages,
          { paddingBottom: 20 },
        ]}
        keyboardDismissMode="interactive"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Image source={require('../../images/osho_chat.png')} style={styles.emptyHeroImage} />
            <Text style={styles.emptyTitle}>Talk to Osho</Text>
            <Text style={styles.emptySubtitle}>
              SwipeChat delivers intelligent money insights with markdown tables and concise recommendations.
            </Text>

            <View style={styles.promptWrap}>
              {quickPrompts.map((prompt) => (
                <Pressable key={prompt} style={styles.promptChip} onPress={() => setInput(prompt)}>
                  <Ionicons name="flash-outline" size={14} color={Colors.accentBlueBright} />
                  <Text style={styles.promptText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.composerWrap}>
            <GlassBackground
              style={styles.composerInner}
              blurIntensity={85}
              blurTint="systemChromeMaterialDark"
              tintColor={Platform.OS === 'ios' ? 'rgba(10, 10, 12, 0.35)' : undefined}
              fallbackColor="rgba(8, 8, 10, 0.92)"
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                style={styles.input}
                placeholder="Ask Osho about your payments..."
                placeholderTextColor={Colors.textMuted}
                keyboardAppearance="dark"
                multiline
                editable={!sending}
                maxLength={700}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <ScalePressable
                onPress={handleSend}
                disabled={!canSend}
                style={styles.sendTapTarget}
              >
                <View
                  style={[
                    styles.sendButton,
                    { backgroundColor: canSend ? Colors.accentBlueBright : 'rgba(255,255,255,0.06)' },
                  ]}
                >
                  <Ionicons name="arrow-up" size={20} color={canSend ? '#FFF' : Colors.textMuted} />
                </View>
              </ScalePressable>
            </GlassBackground>
        </View>
        <View style={{ height: keyboardVisible ? 0 : 100 }} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerTitleWrap: {
    justifyContent: 'center',
  },
  headerEyebrow: {
    ...Typography.caption1,
    color: Colors.accentBlueBright,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    ...Typography.largeTitle,
    color: Colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.navGlassBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(46,230,166,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentEmerald,
  },
  liveText: {
    ...Typography.caption2,
    color: Colors.accentEmerald,
    fontWeight: '700',
  },
  messages: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyHeroImage: {
    width: 132,
    height: 132,
    borderRadius: 66,
    marginBottom: 8,
  },
  emptyTitle: {
    ...Typography.title2,
    color: Colors.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    ...Typography.footnote,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  promptWrap: {
    marginTop: 18,
    width: '100%',
    gap: 10,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: Colors.navGlassBackground,
    borderWidth: 1,
    borderColor: Colors.navGlassBorder,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  promptText: {
    ...Typography.footnote,
    color: '#CFE0FF',
    flex: 1,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  userBubble: {
    borderBottomRightRadius: 8,
    borderColor: 'rgba(248,113,113,0.62)',
    backgroundColor: 'rgba(82,18,24,0.46)',
  },
  assistantBubble: {
    borderBottomLeftRadius: 8,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(12, 16, 22, 0.52)',
  },
  bubbleGlassOverlay: {
    backgroundColor: 'rgba(10, 10, 12, 0.35)',
  },
  bubbleAndroidOverlay: {
    backgroundColor: 'rgba(8, 8, 10, 0.92)',
  },
  userBubbleGlassOverlay: {
    backgroundColor: 'rgba(248,113,113,0.22)',
  },
  userBubbleAndroidOverlay: {
    backgroundColor: 'rgba(78,18,24,0.9)',
  },
  userText: {
    ...Typography.subhead,
    color: '#fff',
    lineHeight: 21,
  },
  typingRow: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 2,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.textMuted,
  },
  composerWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  composerInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    paddingLeft: 13,
    paddingRight: 8,
    paddingVertical: 7,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  composerGlassOverlay: {
    backgroundColor: 'rgba(10, 10, 12, 0.35)',
  },
  composerAndroidOverlay: {
    backgroundColor: 'rgba(8, 8, 10, 0.92)',
  },
  input: {
    flex: 1,
    ...Typography.subhead,
    color: Colors.textPrimary,
    minHeight: 38,
    maxHeight: 120,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendTapTarget: {
    paddingBottom: 0,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.textPrimary,
    ...Typography.subhead,
    lineHeight: 21,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  strong: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bullet_list: {
    marginVertical: 0,
  },
  list_item: {
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  fence: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: Colors.glassBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    color: '#DEE8FF',
    fontSize: 12,
  },
  table: {
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 8,
  },
  thead: {
    backgroundColor: 'rgba(79,124,255,0.14)',
  },
  th: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    color: '#E6EEFF',
    fontSize: 12,
    fontWeight: '700',
  },
  td: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    color: '#E4E8F0',
    fontSize: 12,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassBorder,
  },
  hr: {
    backgroundColor: Colors.glassBorder,
    marginVertical: 8,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBlueBright,
    paddingLeft: 10,
    opacity: 0.9,
  },
});
