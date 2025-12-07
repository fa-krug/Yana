"""
Aggregator information endpoints for API v1.

Provides information about available aggregators for feed creation.
"""

import importlib
import inspect
import logging
import pkgutil
from urllib.parse import urlparse

from ninja import Router

from api_v1.schemas.aggregators import AggregatorListSchema, AggregatorSchema

logger = logging.getLogger(__name__)

router = Router()


def get_favicon_url(url: str | None) -> str | None:
    """
    Generate a favicon URL from a website URL.

    Uses Google's favicon service as a fallback.
    """
    if not url:
        return None

    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split("/")[0]
        if domain:
            # Use Google's favicon service
            return f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
    except Exception:
        pass

    return None


def discover_aggregators():
    """
    Discover all available aggregators from the aggregators package.

    Returns:
        List of aggregator metadata dictionaries
    """
    import aggregators

    aggregator_list = []

    # Iterate through all modules in the aggregators package
    for _importer, modname, _ispkg in pkgutil.iter_modules(aggregators.__path__):
        if modname.startswith("_") or modname in ["base"]:
            continue

        try:
            # Import the module
            module = importlib.import_module(f"aggregators.{modname}")

            # Find the BaseAggregator subclass
            for name, obj in inspect.getmembers(module, inspect.isclass):
                # Check if this is a BaseAggregator subclass (not BaseAggregator itself)
                if (
                    obj.__module__ == f"aggregators.{modname}"
                    and any("BaseAggregator" in str(base) for base in obj.__mro__)
                    and name != "BaseAggregator"
                ):
                    # Get aggregator metadata
                    try:
                        aggregator = obj()
                        url = getattr(aggregator, "url", None)
                        metadata = {
                            "id": modname,
                            "name": getattr(
                                aggregator, "name", modname.replace("_", " ").title()
                            ),
                            "type": getattr(aggregator, "type", "custom"),
                            "description": getattr(aggregator, "description", None),
                            "url": url,
                            "icon": get_favicon_url(url),
                            "feed_type": "article",  # Default
                            "enabled": True,
                        }

                        # Special handling for different aggregator types
                        if modname == "youtube":
                            metadata["feed_type"] = "youtube"
                        elif modname == "podcast":
                            metadata["feed_type"] = "podcast"
                        elif modname == "reddit":
                            metadata["feed_type"] = "reddit"
                            metadata["type"] = "social"

                        aggregator_list.append(metadata)
                        logger.debug(f"Discovered aggregator: {modname}")
                    except Exception as e:
                        logger.warning(
                            f"Could not instantiate aggregator {modname}: {e}"
                        )

        except Exception as e:
            logger.warning(f"Could not load aggregator module {modname}: {e}")

    return aggregator_list


@router.get("/", response=list[AggregatorSchema])
def list_aggregators(request, search: str = None, type: str = None):
    """
    List all available aggregators.

    Args:
        search: Search query for aggregator name
        type: Filter by type (managed, social, custom)

    Returns:
        List of available aggregators
    """
    # Authentication is handled by SessionAuth at the API level
    aggregators = discover_aggregators()

    # Apply filters
    if search:
        aggregators = [
            a
            for a in aggregators
            if search.lower() in a["name"].lower() or search.lower() in a["id"].lower()
        ]

    if type:
        aggregators = [a for a in aggregators if a["type"] == type]

    # Sort by name
    aggregators.sort(key=lambda x: x["name"])

    return [AggregatorSchema(**a) for a in aggregators]


@router.get("/grouped/", response=AggregatorListSchema)
def list_aggregators_grouped(request):
    """
    List all available aggregators grouped by type.

    Returns:
        Aggregators grouped by type (managed, social, custom)
    """
    # Authentication is handled by SessionAuth at the API level
    aggregators = discover_aggregators()

    # Group by type
    grouped = {"managed": [], "social": [], "custom": []}

    for agg in aggregators:
        agg_type = agg.get("type", "custom")
        if agg_type in grouped:
            grouped[agg_type].append(AggregatorSchema(**agg))

    # Sort each group by name
    for group in grouped.values():
        group.sort(key=lambda x: x.name)

    return AggregatorListSchema(**grouped)


@router.get("/{aggregator_id}/", response=dict)
def get_aggregator_detail(request, aggregator_id: str):
    """
    Get detailed information about a specific aggregator including identifier fields and options.

    Returns:
        Dictionary with aggregator details including identifier configuration and options
    """
    from aggregators import get_aggregator_class

    try:
        aggregator_class = get_aggregator_class(aggregator_id)
        aggregator = aggregator_class()

        # Get identifier configuration
        identifier_type = getattr(aggregator, "identifier_type", "url")
        identifier_label = getattr(aggregator, "identifier_label", "Identifier")
        identifier_description = getattr(aggregator, "identifier_description", "")
        identifier_placeholder = getattr(aggregator, "identifier_placeholder", "")
        identifier_choices = getattr(aggregator, "identifier_choices", None)
        identifier_editable = getattr(aggregator, "identifier_editable", False)

        # Convert choices to list of lists if present
        choices_list = None
        if identifier_choices:
            choices_list = [[str(c[0]), str(c[1])] for c in identifier_choices]

        # Get options
        options = getattr(aggregator, "options", {})

        # Convert options choices to list of lists format
        options_dict = {}
        for key, option_def in options.items():
            option_dict = dict(option_def)
            if "choices" in option_dict and option_dict["choices"]:
                option_dict["choices"] = [
                    [str(c[0]), str(c[1])] for c in option_dict["choices"]
                ]
            options_dict[key] = option_dict

        return {
            "id": aggregator_id,
            "identifier_type": identifier_type,
            "identifier_label": identifier_label,
            "identifier_description": identifier_description,
            "identifier_placeholder": identifier_placeholder,
            "identifier_choices": choices_list,
            "identifier_editable": identifier_editable,
            "options": options_dict,
        }
    except Exception as e:
        logger.warning(f"Could not load aggregator {aggregator_id}: {e}")
        return {
            "id": aggregator_id,
            "identifier_type": "url",
            "identifier_label": "Identifier",
            "identifier_description": "",
            "identifier_placeholder": "",
            "identifier_choices": None,
            "identifier_editable": False,
            "options": {},
        }
