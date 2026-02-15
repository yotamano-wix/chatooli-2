"""
CrewAI agent setup with a coding sandbox agent and a general assistant agent.
"""

import os
from crewai import Agent, Task, Crew, Process
from dotenv import load_dotenv

from backend.sandbox_tool import execute_python_code

load_dotenv()


def create_assistant_agent() -> Agent:
    """Create the main assistant agent with a local code execution tool."""
    return Agent(
        role="AI Assistant & Code Sandbox",
        goal="Help users by answering questions, writing code, and executing it. "
             "Always show your reasoning and the code you write.",
        backstory=(
            "You are a highly capable AI assistant that can both chat naturally and write/execute Python code. "
            "When users ask you to write code or solve programming problems, you write clean Python code "
            "and execute it using the Execute Python Code tool to show results. You explain your approach clearly. "
            "For non-code questions, you provide thoughtful, helpful answers."
        ),
        tools=[execute_python_code],
        max_retry_limit=2,
        verbose=True,
    )


def run_agent(user_message: str, agent: Agent | None = None) -> dict:
    """
    Run the CrewAI agent with a user message and return structured output.

    Returns a dict with:
      - response: the final text response
      - code_blocks: list of {code, output} dicts extracted from execution
    """
    if agent is None:
        agent = create_assistant_agent()

    task = Task(
        description=f"""Respond to the following user message. If the user asks you to write or run code, 
write the code and execute it using the Execute Python Code tool, then show the results clearly.

User message: {user_message}

Guidelines:
- If this is a coding request, write clean Python code, execute it with the tool, and explain the output.
- If this is a general question, provide a clear and helpful answer.
- Always be concise but thorough.
- When showing code, wrap it in triple backtick code blocks with the language specified.
""",
        expected_output="A helpful response to the user's message. If code was involved, include the code and its output.",
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()

    # Parse the result
    raw_output = str(result)

    # Extract code blocks if any
    code_blocks = extract_code_blocks(raw_output)

    return {
        "response": raw_output,
        "code_blocks": code_blocks,
    }


def extract_code_blocks(text: str) -> list[dict]:
    """Extract code blocks from the agent's output."""
    blocks = []
    lines = text.split("\n")
    in_code = False
    current_code = []
    lang = "python"

    for line in lines:
        if line.strip().startswith("```"):
            if in_code:
                # End of code block
                blocks.append({
                    "language": lang,
                    "code": "\n".join(current_code),
                })
                current_code = []
                in_code = False
            else:
                # Start of code block
                in_code = True
                lang_hint = line.strip().lstrip("`").strip()
                lang = lang_hint if lang_hint else "python"
        elif in_code:
            current_code.append(line)

    # Handle unclosed code block
    if current_code:
        blocks.append({
            "language": lang,
            "code": "\n".join(current_code),
        })

    return blocks
