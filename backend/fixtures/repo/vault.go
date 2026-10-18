package vault

func ReadToken(key string) string {
	return key
}

func Charge(amount int) string {
	token := ReadToken("pan")
	return token
}
