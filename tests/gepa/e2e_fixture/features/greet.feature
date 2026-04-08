Feature: Greeting API
  As a client
  I want to greet someone via the API
  So that I can verify the service works

  Scenario: Greet by name
    Given the API is running
    When I send a POST to "/api/greet" with body:
      | name  |
      | World |
    Then the response status should be 200
    And the response body should contain "Hello, World!"
