import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, ChatMessage } from '../services/api';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'typing';
  content: string;
}

const CHAT_HISTORY_LIMIT = 20;

export default function ChatScreen() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  let msgCounter = useRef(0);

  const nextId = () => {
    msgCounter.current += 1;
    return `msg_${msgCounter.current}_${Date.now()}`;
  };

  const scrollToEnd = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
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

    // Build history for this request (before adding current turn)
    const requestHistory = [...history];

    try {
      const data = await api.ask(question, requestHistory);

      // Remove typing indicator and add assistant response
      const assistantMsg: DisplayMessage = {
        id: nextId(),
        role: 'assistant',
        content: data.response,
      };

      setMessages((prev) =>
        prev.filter((m) => m.id !== 'typing').concat(assistantMsg)
      );

      // Update conversation history
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
        content: `Error: ${err.message || 'Something went wrong'}`,
      };
      setMessages((prev) =>
        prev.filter((m) => m.id !== 'typing').concat(errorMsg)
      );
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const renderMessage = ({ item }: { item: DisplayMessage }) => {
    if (item.role === 'typing') {
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <View style={styles.typingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
        </View>
      );
    }

    const isUser = item.role === 'user';
    return (
      <View
        style={[
          styles.bubbleWrapper,
          isUser ? styles.userWrapper : styles.assistantWrapper,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <LinearGradient
              colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
              style={styles.avatar}
            >
              <Ionicons name="sparkles" size={14} color="#FFF" />
            </LinearGradient>
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              isUser ? styles.userBubbleText : styles.assistantBubbleText,
            ]}
          >
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <LinearGradient
          colors={[Colors.gradientAccentStart, Colors.gradientAccentEnd]}
          style={styles.headerIcon}
        >
          <Ionicons name="sparkles" size={18} color="#FFF" />
        </LinearGradient>
        <View>
          <Text style={styles.headerTitle}>Financial Assistant</Text>
          <Text style={styles.headerSubtitle}>Powered by RAG + Groq</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Ask me anything</Text>
            <Text style={styles.emptySubtitle}>
              I can analyze your transactions, answer spending questions, and provide financial guidance
            </Text>
            <View style={styles.suggestions}>
              {[
                'What did I spend on food this week?',
                'How can I cut down on spending?',
                'Where was my last transaction?',
              ].map((suggestion, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionChip}
                  onPress={() => {
                    setInput(suggestion);
                  }}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />

      {/* Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your transactions..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            editable={!sending}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending || !input.trim()}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={
                input.trim() && !sending
                  ? [Colors.gradientAccentStart, Colors.gradientAccentEnd]
                  : [Colors.bgCardElevated, Colors.bgCardElevated]
              }
              style={styles.sendButton}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={input.trim() && !sending ? '#FFF' : Colors.textMuted}
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 14,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    ...Typography.caption1,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  assistantWrapper: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
    marginBottom: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: Colors.accentBlue,
    borderBottomRightRadius: 6,
    marginLeft: 'auto',
  },
  assistantBubble: {
    backgroundColor: Colors.bgCard,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  bubbleText: {
    ...Typography.subhead,
    lineHeight: 22,
  },
  userBubbleText: {
    color: '#FFF',
  },
  assistantBubbleText: {
    color: Colors.textPrimary,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    ...Typography.title3,
    color: Colors.textSecondary,
    marginTop: 16,
  },
  emptySubtitle: {
    ...Typography.footnote,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  suggestions: {
    marginTop: 24,
    gap: 10,
    width: '100%',
  },
  suggestionChip: {
    backgroundColor: Colors.bgCard,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  suggestionText: {
    ...Typography.footnote,
    color: Colors.accentBlueBright,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    color: Colors.textPrimary,
    ...Typography.subhead,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
