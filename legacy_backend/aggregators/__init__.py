"""
Aggregators package for Yana.

This package contains class-based aggregators for collecting content from various RSS feeds.
Each aggregator module should contain a single class that inherits from BaseAggregator.

Aggregators are auto-discovered by scanning the aggregators/ directory.
Each aggregator has a unique ID that feeds reference.
"""

import importlib
import inspect
import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AggregatorMetadata:
    """Metadata for an aggregator."""

    id: str  # Unique aggregator ID (e.g., "heise", "full_website")
    module_name: str
    class_name: str
    aggregator_path: str  # e.g., "aggregators.heise" (for internal use)
    type: str  # "managed", "custom", or "social"
    name: str
    url: str  # Default/example URL (for managed aggregators)
    description: str
    # Identifier configuration - defines the primary input field
    identifier_type: str = "url"  # "url" or "string"
    identifier_label: str = "Feed URL"
    identifier_description: str = "Enter the RSS feed URL"
    identifier_placeholder: str = ""
    identifier_choices: list[tuple[str, str]] | None = (
        None  # Optional choices for dropdown
    )
    identifier_editable: bool = False  # Whether identifier can be edited after creation


def get_aggregator_metadata(module_name: str) -> AggregatorMetadata | None:
    """
    Load metadata for a specific aggregator module.

    Args:
        module_name: The name of the aggregator module (without .py extension)

    Returns:
        AggregatorMetadata object or None if the module cannot be loaded
    """
    try:
        module = importlib.import_module(f"aggregators.{module_name}")

        # Find the BaseAggregator subclass in this module
        aggregator_class = None
        for name, obj in inspect.getmembers(module, inspect.isclass):
            # Check if it's defined in this module and inherits from BaseAggregator
            if (
                obj.__module__ == f"aggregators.{module_name}"
                and any("BaseAggregator" in str(base) for base in obj.__mro__)
                and name != "BaseAggregator"
            ):
                aggregator_class = obj
                break

        if not aggregator_class:
            logger.debug(f"Module {module_name} has no BaseAggregator subclass")
            return None

        # Instantiate to get metadata (enforces required properties)
        try:
            instance = aggregator_class()
        except NotImplementedError as e:
            logger.warning(f"Aggregator {module_name} missing required metadata: {e}")
            return None

        # Get metadata from instance properties
        aggregator_id = instance.id
        aggregator_path = f"aggregators.{module_name}"
        aggregator_type = instance.type
        name = instance.name
        url = instance.url
        description = instance.description

        # Get identifier configuration
        identifier_type = getattr(instance, "identifier_type", "url")
        identifier_label = getattr(instance, "identifier_label", "Feed URL")
        identifier_description = getattr(
            instance, "identifier_description", "Enter the RSS feed URL"
        )
        identifier_placeholder = getattr(instance, "identifier_placeholder", "")
        identifier_choices = getattr(instance, "identifier_choices", None)
        identifier_editable = getattr(instance, "identifier_editable", False)

        return AggregatorMetadata(
            id=aggregator_id,
            module_name=module_name,
            class_name=aggregator_class.__name__,
            aggregator_path=aggregator_path,
            type=aggregator_type,
            name=name,
            url=url,
            description=description,
            identifier_type=identifier_type,
            identifier_label=identifier_label,
            identifier_description=identifier_description,
            identifier_placeholder=identifier_placeholder,
            identifier_choices=identifier_choices,
            identifier_editable=identifier_editable,
        )

    except Exception as e:
        logger.warning(f"Could not load aggregator module {module_name}: {e}")
        return None


def get_all_aggregators() -> list[AggregatorMetadata]:
    """
    Discover all available aggregator modules in the aggregators package.

    Returns:
        List of AggregatorMetadata objects, sorted by type (managed first) and then by name.
    """
    aggregators: list[AggregatorMetadata] = []
    package_dir = os.path.dirname(__file__)

    # Scan the aggregators directory for Python files
    for filename in sorted(os.listdir(package_dir)):
        if filename.endswith(".py") and not filename.startswith("_"):
            module_name = filename[:-3]  # Remove .py extension

            # Skip base.py as it's not an aggregator
            if module_name == "base":
                continue

            metadata = get_aggregator_metadata(module_name)
            if metadata:
                aggregators.append(metadata)

    # Sort: managed aggregators first, then social, then custom, then alphabetically by name
    type_order = {"managed": 0, "social": 1, "custom": 2}
    aggregators.sort(key=lambda x: (type_order.get(x.type, 99), x.name))

    return aggregators


def get_available_aggregators() -> list[tuple[str, str]]:
    """
    Discover all available aggregator modules in the aggregators package.

    Returns:
        List of tuples (aggregator_id, display_name) for use in Django choices.
        The default aggregator is always listed first.
    """
    aggregators: list[tuple[str, str]] = []
    all_metadata = get_all_aggregators()

    for metadata in all_metadata:
        aggregators.append((metadata.id, metadata.name))

    # Sort to put full_website first, then alphabetically
    aggregators.sort(key=lambda x: (x[0] != "full_website", x[1]))

    return aggregators


def get_aggregator_class(aggregator_id: str):
    """
    Get the aggregator class for an aggregator ID.

    Args:
        aggregator_id: Aggregator ID (e.g., "heise", "full_website")

    Returns:
        Aggregator class

    Raises:
        ValueError: If aggregator ID not found
    """
    # Find aggregator metadata by ID
    metadata = get_aggregator_by_id(aggregator_id)

    if not metadata:
        raise ValueError(f"Aggregator '{aggregator_id}' not found")

    # Import module directly (Python caches this automatically)
    try:
        module = importlib.import_module(metadata.aggregator_path)
    except Exception as e:
        raise ValueError(
            f"Could not import aggregator module '{metadata.aggregator_path}': {e}"
        ) from e

    # Find the BaseAggregator subclass in this module
    for name, obj in inspect.getmembers(module, inspect.isclass):
        if (
            obj.__module__ == metadata.aggregator_path
            and any("BaseAggregator" in str(base) for base in obj.__mro__)
            and name != "BaseAggregator"
        ):
            return obj

    raise ValueError(f"No BaseAggregator subclass found in {metadata.aggregator_path}")


def get_aggregator_by_id(aggregator_id: str) -> AggregatorMetadata | None:
    """
    Get aggregator metadata by ID.

    Args:
        aggregator_id: Aggregator ID to look up

    Returns:
        AggregatorMetadata or None if not found
    """
    all_aggregators = get_all_aggregators()
    for metadata in all_aggregators:
        if metadata.id == aggregator_id:
            return metadata
    return None
