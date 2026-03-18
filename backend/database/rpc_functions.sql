-- Function to atomically delete all user data
CREATE OR REPLACE FUNCTION delete_user_data(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM transactions WHERE user_id = p_user_id;
    DELETE FROM budgets WHERE user_id = p_user_id;
    DELETE FROM accounts WHERE user_id = p_user_id;
    DELETE FROM simplefin_connections WHERE user_id = p_user_id;
    DELETE FROM user_cards WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to atomically replace user cards
CREATE OR REPLACE FUNCTION replace_user_cards(p_user_id UUID, p_cards JSONB)
RETURNS VOID AS $$
BEGIN
    DELETE FROM user_cards WHERE user_id = p_user_id;
    INSERT INTO user_cards (user_id, card_name, issuer, card_image_url, reward_type, annual_fee, reward_multipliers)
    SELECT 
        p_user_id,
        (elem->>'card_name'),
        (elem->>'issuer'),
        (elem->>'card_image_url'),
        (elem->>'reward_type'),
        (elem->>'annual_fee')::NUMERIC,
        (elem->'reward_multipliers')
    FROM jsonb_array_elements(p_cards) AS elem;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
