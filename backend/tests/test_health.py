def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "connected"}


def test_versioned_health(client):
    assert client.get("/v1/health").status_code == 200


def test_signup_flow_fixture(make_user):
    user = make_user()

    response = user.client.get("/v1/users/me")
    assert response.status_code == 200
    assert response.json()["id"] == user.id
