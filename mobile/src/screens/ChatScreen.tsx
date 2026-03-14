import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Keyboard,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ChatMessage } from '../services/api';
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
  'Give me a concise weekly spending summary.',
  'Find unusual transactions I should verify.',
];

function TypingIndicator() {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.typingRow, { opacity: pulse }]}> 
      <View style={styles.typingDot} />
      <View style={styles.typingDot} />
      <View style={styles.typingDot} />
    </Animated.View>
  );
}

function MessageBubble({ item }: { item: DisplayMessage }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, y]);

  if (item.role === 'typing') {
    return (
      <Animated.View style={[styles.messageRow, styles.assistantRow, { opacity, transform: [{ translateY: y }] }]}> 
        <View style={styles.assistantAvatar}>
          <Ionicons name="sparkles" size={13} color="#0D1116" />
        </View>
        <View style={[styles.bubble, styles.assistantBubble]}>
          <TypingIndicator />
        </View>
      </Animated.View>
    );
  }

  const isUser = item.role === 'user';
  return (
    <Animated.View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow, { opacity, transform: [{ translateY: y }] }]}> 
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <Image source={require('../../images/osho_chat.png')} style={styles.avatarImage} />
        </View>
      )}

      {isUser ? (
        <LinearGradient
          colors={[Colors.gradientAccentStart, '#6EA6FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.userBubble]}
        >
          <Text style={styles.userText}>{item.content}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <Markdown style={markdownStyles}>{item.content}</Markdown>
        </View>
      )}
    </Animated.View>
  );
}

export default function ChatScreen() {
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
      <LinearGradient
        colors={['#000000', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}> 
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Swipe</Text>
          <Text style={styles.headerTitle}>Osho</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Online</Text>
          </View>
          <TouchableOpacity onPress={handleClearChat} style={styles.clearBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
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
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubble-ellipses" size={26} color={Colors.textPrimary} />
            </View>
            <Text style={styles.emptyTitle}>Talk to Osho</Text>
            <Text style={styles.emptySubtitle}>
              SwipeChat delivers intelligent money insights with rich summaries, markdown tables, and concise recommendations.
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
        <View style={[styles.composerWrap]}> 
            <View style={styles.composerInner}>
              <TextInput
                value={input}
                onChangeText={setInput}
                style={styles.input}
                placeholder="Ask Osho about your finances..."
                placeholderTextColor={Colors.textMuted}
                keyboardAppearance="dark"
                multiline
                editable={!sending}
                maxLength={700}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.85}
              style={styles.sendTapTarget}
            >
              <View
                style={[
                  styles.sendButton,
                  { backgroundColor: canSend ? Colors.accentBlueBright : '#2A3040' }
                ]}
              >
                <Ionicons name="arrow-up" size={20} color={canSend ? '#FFF' : Colors.textMuted} />
              </View>
            </TouchableOpacity>
          </View>
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
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
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
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,124,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(130,166,255,0.32)',
  },
  emptyTitle: {
    ...Typography.title2,
    color: Colors.textPrimary,
    marginTop: 14,
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
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
  },
  userBubble: {
    borderBottomRightRadius: 8,
  },
  assistantBubble: {
    borderBottomLeftRadius: 8,
    backgroundColor: '#1A1F2A',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'rgba(38,42,50,0.92)',
    paddingLeft: 13,
    paddingRight: 8,
    paddingVertical: 7,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
