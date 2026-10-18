"""Token vault client. The compiler turns these symbols into graph nodes."""


class TokenVault:
    def fetch(self, key: str) -> str:
        return key


def read_token(vault: TokenVault, key: str) -> str:
    return vault.fetch(key)


def charge(vault: TokenVault, amount: int) -> str:
    token = read_token(vault, "pan")
    return f"{token}:{amount}"
